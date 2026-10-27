import { db } from '$lib/server/db/client';
import { NotFoundError } from '$lib/server/errors';
import type { RegistrationInput } from '$lib/registration/schema';
import { recordAudit } from '$lib/server/modules/audit/service';
import { hashSessionToken } from '$lib/server/modules/auth/token';
import { enqueueMessages } from '$lib/server/modules/messaging/outbox';
import { resolveLink } from './link-service';
import * as repo from './repository';
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
	type Meta
} from './intake';

type Link = NonNullable<Awaited<ReturnType<typeof resolveLink>>>;

async function storeRegistration(
	link: Link,
	data: RegistrationInput,
	meta: Meta,
	payload: ReturnType<typeof storablePayload>,
	members: Member[]
): Promise<string[]> {
	return db.transaction(async (tx) => {
		const registrationId = await repo.insertRegistration(tx, {
			registrationLinkId: link.linkId,
			branchId: link.branchId,
			payload,
			locale: meta.locale,
			contactEmail: data.people[0].email ?? null,
			contactPhone: data.people[0].phone ?? null
		});

		const consents = planConsents(data, members, nikHashesOf(payload));
		await repo.insertConsents(
			tx,
			consents.map((c) => ({
				registrationId,
				personIndex: c.personIndex,
				matchedPersonId: c.member.id,
				tokenHash: c.token ? hashSessionToken(c.token) : null
			}))
		);
		const name = data.people[0].fullName;
		const ids = await enqueueMessages(
			tx,
			consents.flatMap((c) => (c.token ? [consentMessage(c.member, name, c.token)] : []))
		);

		await recordAudit(tx, {
			action: 'registration.submitted',
			entityType: 'registration',
			entityId: registrationId,
			branchId: link.branchId,
			diff: { peopleCount: { after: data.people.length } }
		});
		return ids;
	});
}

export async function submitRegistration(token: string, input: unknown, meta: Meta): Promise<void> {
	const link = await resolveLink(token);
	if (!link) throw new NotFoundError('RegistrationLink', 'unknown');
	// Before parsing, so malformed spam is counted too.
	await enforceThrottle(meta);
	const data = parseRegistration(input);
	const payload = storablePayload(data);
	const members = await findMembersFor(data, nikHashesOf(payload));
	deliverLater(await storeRegistration(link, data, meta, payload, members));
}
