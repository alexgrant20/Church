import { db, type Transaction } from '$lib/server/db/client';
import { decryptNik, maskNik } from '$lib/server/crypto';
import { NotFoundError } from '$lib/server/errors';
import type { RegistrationInput } from '$lib/registration/schema';
import { recordAudits } from '$lib/server/modules/audit/service';
import { hashSessionToken } from '$lib/server/modules/auth/token';
import { cityNames } from '$lib/server/modules/location/service';
import { enqueueMessages } from '$lib/server/modules/messaging/outbox';
import * as repo from './fix-repository';
import { insertConsents } from './repository';
import {
	consentMessage,
	deliverLater,
	enforceThrottle,
	findMembersFor,
	nikHashesOf,
	parseRegistration,
	planConsents,
	storablePayload,
	type Member,
	type Meta,
	type StoredPerson
} from './intake';

type StoredPayload = Omit<RegistrationInput, 'people'> & { people: StoredPerson[] };

export async function loadFix(token: string) {
	const reg = await repo.findByFixToken(hashSessionToken(token));
	if (!reg) throw new NotFoundError('RegistrationFix', 'unknown');
	const payload = reg.payload as StoredPayload;
	// The stored NIK never goes back to the browser; only its masked form does.
	const people = payload.people.map((p) => {
		const rest: Partial<StoredPerson> = { ...p };
		delete rest.nikEncrypted;
		delete rest.nikHash;
		return rest;
	});
	const nikMasked = payload.people.map((p) =>
		p.nikEncrypted ? maskNik(decryptNik(Buffer.from(p.nikEncrypted, 'base64'))) : null
	);
	const cityIds = payload.people.flatMap((p) => [p.birthCityId, p.address.cityId]);
	return {
		reason: reg.fixReason ?? '',
		branchName: reg.branchName,
		input: { ...payload, people } as RegistrationInput,
		nikMasked,
		// The form shows city names; the payload holds only their ids.
		cityNames: await cityNames(cityIds)
	};
}

type Planned = ReturnType<typeof planConsents>[number];

// A match that is still the same member keeps its decision; anything else is replaced.
async function reconcileConsents(tx: Transaction, registrationId: string, planned: Planned[]) {
	const existing = await repo.lockLiveConsents(tx, registrationId);
	const same = (c: (typeof existing)[number], p: Planned) =>
		c.personIndex === p.personIndex && c.matchedPersonId === p.member.id;
	const dropped = existing.filter((c) => !planned.some((p) => same(c, p)));
	const added = planned.filter((p) => !existing.some((c) => same(c, p)));
	await repo.softDeleteConsents(
		tx,
		dropped.map((c) => c.id),
		new Date()
	);
	await insertConsents(
		tx,
		added.map((p) => ({
			registrationId,
			personIndex: p.personIndex,
			matchedPersonId: p.member.id,
			tokenHash: p.token ? hashSessionToken(p.token) : null
		}))
	);
	return { dropped, added };
}

async function storeFix(
	tokenHash: string,
	data: RegistrationInput,
	meta: Meta,
	payload: StoredPayload,
	members: Member[]
): Promise<string[]> {
	return db.transaction(async (tx) => {
		const reg = await repo.claimFix(tx, tokenHash, {
			status: 'pending',
			fixTokenHash: null,
			fixReason: null,
			payload,
			locale: meta.locale,
			contactEmail: data.people[0].email ?? null,
			contactPhone: data.people[0].phone ?? null,
			submittedAt: new Date()
		});
		if (!reg) throw new NotFoundError('RegistrationFix', 'unknown');
		const planned = planConsents(data, members, nikHashesOf(payload));
		const { dropped, added } = await reconcileConsents(tx, reg.id, planned);
		const name = data.people[0].fullName;
		const ids = await enqueueMessages(
			tx,
			added.flatMap((p) => (p.token ? [consentMessage(p.member, name, p.token)] : []))
		);
		const base = { entityType: 'registration', entityId: reg.id, branchId: reg.branchId };
		await recordAudits(tx, [
			{
				...base,
				action: 'registration.resubmitted',
				diff: { status: { before: 'needs_fix', after: 'pending' } }
			},
			...dropped.map((c) => ({
				...base,
				action: 'registration.consent_removed',
				diff: {
					consent: { personIndex: c.personIndex, matchedPersonId: { before: c.matchedPersonId } }
				}
			}))
		]);
		return ids;
	});
}

export async function resubmitFix(token: string, input: unknown, meta: Meta): Promise<void> {
	const tokenHash = hashSessionToken(token);
	const reg = await repo.findByFixToken(tokenHash);
	if (!reg) throw new NotFoundError('RegistrationFix', 'unknown');
	await enforceThrottle(meta);
	const data = parseRegistration(input);
	const payload = storablePayload(data, (reg.payload as StoredPayload).people);
	const members = await findMembersFor(data, nikHashesOf(payload));
	deliverLater(await storeFix(tokenHash, data, meta, payload, members));
}
