import { db } from '$lib/server/db/client';
import { config } from '$lib/server/config';
import { encryptNik, keyedHash } from '$lib/server/crypto';
import { NotFoundError, ValidationError } from '$lib/server/errors';
import { registrationSchema, type RegistrationInput } from '$lib/registration/schema';
import type { Locale } from '$lib/paraglide/runtime';
import { recordAudit } from '$lib/server/modules/audit/service';
import { generateSessionToken, hashSessionToken } from '$lib/server/modules/auth/token';
import { deliverOutbox, enqueueMessages } from '$lib/server/modules/messaging/outbox';
import { resolveLink } from './link-service';
import * as repo from './repository';

const WINDOW_MS = 60 * 60_000;
const MAX_PER_DEVICE = 5;
const MAX_PER_IP = 50;

type Meta = { ip: string; deviceId: string; locale: Locale };
type Member = Awaited<ReturnType<typeof repo.findMatchingMembers>>[number];
type Person = RegistrationInput['people'][number];

async function enforceThrottle({ ip, deviceId }: Meta) {
	const now = new Date();
	const [device, byIp] = await Promise.all([
		repo.hitThrottle(keyedHash(`device:${deviceId}`), now, WINDOW_MS),
		repo.hitThrottle(keyedHash(`ip:${ip}`), now, WINDOW_MS)
	]);
	if (device > MAX_PER_DEVICE || byIp > MAX_PER_IP) {
		throw new ValidationError('error_too_many_submissions');
	}
}

function storablePayload(input: RegistrationInput) {
	const stored = input.people.map(({ nik, ...rest }) =>
		nik
			? { ...rest, nikEncrypted: encryptNik(nik).toString('base64'), nikHash: keyedHash(nik) }
			: rest
	);
	return { ...input, people: stored };
}

// A person matches a member by NIK first, then email, then phone.
function matchFor(person: Person, members: Member[]): Member | undefined {
	const byNik = person.nik && keyedHash(person.nik);
	return (
		(byNik ? members.find((m) => m.nikHash === byNik) : undefined) ??
		members.find((m) => person.email && m.email?.toLowerCase() === person.email) ??
		members.find((m) => person.phone && m.phone === person.phone)
	);
}

function consentMessage(member: Member, registrantName: string, token: string) {
	const channel = member.phone ? ('whatsapp' as const) : ('email' as const);
	return {
		channel,
		to: (channel === 'whatsapp' ? member.phone : member.email)!.toLowerCase(),
		template: 'consent_request' as const,
		locale: member.locale as Locale,
		params: { registrantName, consentUrl: `${config.ORIGIN}/consent/${token}` }
	};
}

type Link = NonNullable<Awaited<ReturnType<typeof resolveLink>>>;

async function storeRegistration(
	link: Link,
	data: RegistrationInput,
	meta: Meta,
	members: Member[]
): Promise<string[]> {
	return db.transaction(async (tx) => {
		const registrationId = await repo.insertRegistration(tx, {
			registrationLinkId: link.linkId,
			branchId: link.branchId,
			payload: storablePayload(data),
			locale: meta.locale,
			contactEmail: data.people[0].email ?? null,
			contactPhone: data.people[0].phone ?? null
		});

		const consents = data.people.flatMap((p, personIndex) => {
			const member = matchFor(p, members);
			if (!member) return [];
			const token = member.activatedAt ? generateSessionToken() : null;
			return [{ personIndex, member, token }];
		});
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
	const parsed = registrationSchema.safeParse(input);
	if (!parsed.success) throw new ValidationError('error_invalid_registration', parsed.error.issues);
	const data = parsed.data;

	const members = await repo.findMatchingMembers({
		nikHashes: data.people.flatMap((p) => (p.nik ? [keyedHash(p.nik)] : [])),
		emails: data.people.flatMap((p) => (p.email ? [p.email] : [])),
		phones: data.people.flatMap((p) => (p.phone ? [p.phone] : []))
	});

	const messageIds = await storeRegistration(link, data, meta, members);

	// Not awaited: reply timing must not reveal whether anyone matched.
	if (messageIds.length) {
		deliverOutbox(messageIds).catch((err) =>
			console.error('consent delivery failed', (err as Error)?.name)
		);
	}
}
