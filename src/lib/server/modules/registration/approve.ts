import { db, type Transaction } from '$lib/server/db/client';
import { config } from '$lib/server/config';
import { ValidationError } from '$lib/server/errors';
import type { RegistrationInput } from '$lib/registration/schema';
import { recordAudit } from '$lib/server/modules/audit/service';
import { enqueueMessage } from '$lib/server/modules/messaging/outbox';
import { nextMemberCode } from '$lib/server/modules/people/member-code';
import * as repo from './approve-repository';
import { claim, decided, deliverAfterCommit, noticeTo, registrantName } from './decide';
import { lockConsents } from './decide-repository';
import { deriveRelationships } from './relationships';

type StoredPerson = Omit<RegistrationInput['people'][number], 'nik'> & {
	nikEncrypted?: string;
	nikHash?: string;
};
type Stored = { people: StoredPerson[]; parentsMarried: boolean };
type Registration = Awaited<ReturnType<typeof claim>>;
type Consent = Awaited<ReturnType<typeof lockConsents>>[number];

function personRow(p: StoredPerson, reg: Registration, householdId: string, memberCode: string) {
	return {
		memberCode,
		fullName: p.fullName,
		nickname: p.nickname,
		chineseName: p.chineseName,
		sex: p.sex,
		birthDate: p.birthDate,
		birthCityId: p.birthCityId,
		// The ciphertext moves as stored; approval never decrypts a NIK.
		nikEncrypted: p.nikEncrypted ? Buffer.from(p.nikEncrypted, 'base64') : null,
		nikHash: p.nikHash ?? null,
		preferredLocale: reg.locale,
		homeBranchId: reg.branchId,
		householdId,
		addressLine: p.address.line,
		postalCode: p.address.postalCode,
		cityId: p.address.cityId
	};
}

const profileRow = (p: StoredPerson, personId: string) => ({
	personId,
	occupation: p.occupation,
	education: p.education,
	previousChurch: p.previousChurch,
	baptized: p.baptism.baptized,
	baptismDate: p.baptism.baptized ? p.baptism.date : null,
	baptismChurch: p.baptism.baptized ? p.baptism.church : null,
	sidi: p.sidi.sidi,
	sidiDate: p.sidi.sidi ? p.sidi.date : null,
	sidiChurch: p.sidi.sidi ? p.sidi.church : null
});

function relationshipRows(stored: Stored, idAt: Map<number, string>) {
	const derived = deriveRelationships(
		stored.people as RegistrationInput['people'],
		stored.parentsMarried
	);
	return derived.flatMap((r) => {
		const from = idAt.get(r.from);
		const to = idAt.get(r.to);
		if (!from || !to) return [];
		// A couple is stored once, with the smaller id first.
		const [a, b] = r.kind === 'spouse' && from > to ? [to, from] : [from, to];
		return [{ kind: r.kind, personId: a, relatedPersonId: b }];
	});
}

async function createPeople(
	tx: Transaction,
	reg: Registration,
	stored: Stored,
	skip: Set<number>,
	householdId: string
) {
	const branch = (await repo.findBranch(tx, reg.branchId))!;
	const year = new Date().getFullYear();
	const indexes = stored.people.flatMap((_, i) => (skip.has(i) ? [] : [i]));
	const codes: string[] = [];
	// The one accepted per-person call: an atomic counter, kept sequential so codes follow order.
	for (let n = 0; n < indexes.length; n++) codes.push(await nextMemberCode(tx, branch, year));
	const ids = await repo.insertPeople(
		tx,
		indexes.map((i, n) => personRow(stored.people[i], reg, householdId, codes[n]))
	);
	await repo.insertProfiles(
		tx,
		indexes.map((i, n) => profileRow(stored.people[i], ids[n]))
	);
	await repo.insertAccounts(
		tx,
		indexes.flatMap((i, n) => {
			const { email, phone } = stored.people[i];
			return email || phone ? [{ personId: ids[n], email, phone }] : [];
		})
	);
	return { indexes, ids, codes };
}

async function applyConsents(tx: Transaction, consents: Consent[], householdId: string) {
	if (consents.some((c) => c.decision === 'waiting')) {
		throw new ValidationError('error_waiting_for_consent');
	}
	const given = consents.filter((c) => c.decision === 'given');
	await repo.movePeople(
		tx,
		given.map((c) => c.matchedPersonId),
		householdId
	);
	return {
		skip: new Set(consents.map((c) => c.personIndex)),
		linked: new Map(given.map((c) => [c.personIndex, c.matchedPersonId])),
		declined: consents.some((c) => c.decision === 'declined')
	};
}

async function auditApproval(
	tx: Transaction,
	reg: Registration,
	householdId: string,
	stored: Stored,
	created: Awaited<ReturnType<typeof createPeople>>
) {
	await recordAudit(tx, {
		action: 'registration.approved',
		entityType: 'registration',
		entityId: reg.id,
		branchId: reg.branchId,
		diff: { status: { before: 'pending', after: 'approved' }, householdId: { after: householdId } }
	});
	// recordAudit takes one row; a registration holds at most 15 people.
	for (const [n, i] of created.indexes.entries()) {
		const p = stored.people[i];
		await recordAudit(tx, {
			action: 'person.created',
			entityType: 'person',
			entityId: created.ids[n],
			branchId: reg.branchId,
			diff: {
				fullName: { after: p.fullName },
				memberCode: { after: created.codes[n] },
				householdId: { after: householdId },
				...(p.nikHash ? { nik: { changed: true } } : {})
			}
		});
	}
}

async function approveIn(tx: Transaction, id: string) {
	const reg = await claim(tx, id, { status: 'approved', ...decided() });
	const consents = await lockConsents(tx, id);
	const householdId = await repo.insertHousehold(tx);
	const { skip, linked, declined } = await applyConsents(tx, consents, householdId);
	const stored = reg.payload as Stored;
	const created = await createPeople(tx, reg, stored, skip, householdId);

	const idAt = new Map(linked);
	created.indexes.forEach((i, n) => idAt.set(i, created.ids[n]));
	const registrant = idAt.get(0);
	if (registrant) await repo.setRegisteredBy(tx, created.ids, registrant);
	await repo.insertRelationships(tx, relationshipRows(stored, idAt));
	await auditApproval(tx, reg, householdId, stored, created);

	const messageId = await enqueueMessage(tx, {
		...noticeTo(reg, 'registration_approved'),
		params: {
			name: registrantName(reg),
			activateUrl: `${config.ORIGIN}/activate`,
			someoneNotAdded: declined ? 'yes' : 'no'
		}
	});
	return { householdId, messageId };
}

export async function approveRegistration(id: string): Promise<{ householdId: string }> {
	const { householdId, messageId } = await db.transaction((tx) => approveIn(tx, id));
	deliverAfterCommit([messageId]);
	return { householdId };
}
