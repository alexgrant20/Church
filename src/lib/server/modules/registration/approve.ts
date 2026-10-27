import { db, type Transaction } from '$lib/server/db/client';
import { config } from '$lib/server/config';
import { ValidationError } from '$lib/server/errors';
import type { RegistrationInput } from '$lib/registration/schema';
import { enqueueMessage } from '$lib/server/modules/messaging/outbox';
import { nextMemberCode } from '$lib/server/modules/people/member-code';
import * as repo from './approve-repository';
import { auditApproval } from './approve-audit';
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

const indexesOf = (stored: Stored, skip: Set<number>) =>
	stored.people.flatMap((_, i) => (skip.has(i) ? [] : [i]));

// Checked up front so the caller gets a message key, not a raw unique violation.
async function assertContactsFree(tx: Transaction, people: StoredPerson[]) {
	const taken = await repo.contactTaken(
		tx,
		people.flatMap((p) => (p.email ? [p.email] : [])),
		people.flatMap((p) => (p.phone ? [p.phone] : []))
	);
	if (taken) throw new ValidationError('error_contact_taken');
}

async function createPeople(
	tx: Transaction,
	reg: Registration,
	stored: Stored,
	skip: Set<number>,
	householdId: string
) {
	await assertContactsFree(
		tx,
		indexesOf(stored, skip).map((i) => stored.people[i])
	);
	const branch = (await repo.findBranch(tx, reg.branchId))!;
	const year = new Date().getFullYear();
	const indexes = indexesOf(stored, skip);
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
	const moves = await repo.movePeople(
		tx,
		given.map((c) => c.matchedPersonId),
		householdId
	);
	return {
		moves,
		skip: new Set(consents.map((c) => c.personIndex)),
		linked: new Map(given.map((c) => [c.personIndex, c.matchedPersonId])),
		declined: consents.some((c) => c.decision === 'declined')
	};
}

async function approveIn(tx: Transaction, id: string) {
	const reg = await claim(tx, id, { status: 'approved', ...decided() });
	const consents = await lockConsents(tx, id);
	const householdId = await repo.insertHousehold(tx);
	const { skip, linked, declined, moves } = await applyConsents(tx, consents, householdId);
	const stored = reg.payload as Stored;
	const created = await createPeople(tx, reg, stored, skip, householdId);

	const idAt = new Map(linked);
	created.indexes.forEach((i, n) => idAt.set(i, created.ids[n]));
	const registrant = idAt.get(0);
	// The registrant has no registrar; the others point at them.
	if (registrant) {
		await repo.setRegisteredBy(
			tx,
			created.ids.filter((x) => x !== registrant),
			registrant
		);
	}
	await repo.insertRelationships(tx, relationshipRows(stored, idAt));
	await auditApproval(tx, reg, householdId, stored.people, created, moves);

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
