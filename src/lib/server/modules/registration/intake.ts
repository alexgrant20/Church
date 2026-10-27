import { config } from '$lib/server/config';
import { encryptNik, keyedHash } from '$lib/server/crypto';
import { ValidationError } from '$lib/server/errors';
import { registrationSchema, type RegistrationInput } from '$lib/registration/schema';
import type { Locale } from '$lib/paraglide/runtime';
import { generateSessionToken } from '$lib/server/modules/auth/token';
import { deliverOutbox } from '$lib/server/modules/messaging/outbox';
import * as repo from './repository';

const WINDOW_MS = 60 * 60_000;
const MAX_PER_DEVICE = 5;
const MAX_PER_IP = 50;

export type Meta = { ip: string; deviceId: string; locale: Locale };
export type Member = Awaited<ReturnType<typeof repo.findMatchingMembers>>[number];
type Person = RegistrationInput['people'][number];
export type StoredPerson = Omit<Person, 'nik'> & { nikEncrypted?: string; nikHash?: string };

export async function enforceThrottle({ ip, deviceId }: Meta) {
	const now = new Date();
	const [device, byIp] = await Promise.all([
		repo.hitThrottle(keyedHash(`device:${deviceId}`), now, WINDOW_MS),
		repo.hitThrottle(keyedHash(`ip:${ip}`), now, WINDOW_MS)
	]);
	if (device > MAX_PER_DEVICE || byIp > MAX_PER_IP) {
		throw new ValidationError('error_too_many_submissions');
	}
}

export function parseRegistration(input: unknown): RegistrationInput {
	const parsed = registrationSchema.safeParse(input);
	if (!parsed.success) throw new ValidationError('error_invalid_registration', parsed.error.issues);
	return parsed.data;
}

// A NIK that was not retyped on the fix page keeps the one stored for that person.
export function storablePayload(input: RegistrationInput, previous: StoredPerson[] = []) {
	const stored = input.people.map(({ nik, ...rest }, i): StoredPerson => {
		if (nik)
			return { ...rest, nikEncrypted: encryptNik(nik).toString('base64'), nikHash: keyedHash(nik) };
		const kept = previous[i];
		return kept?.nikHash
			? { ...rest, nikEncrypted: kept.nikEncrypted, nikHash: kept.nikHash }
			: rest;
	});
	return { ...input, people: stored };
}

export const nikHashesOf = (payload: { people: StoredPerson[] }) =>
	payload.people.map((p) => p.nikHash);

export function findMembersFor(data: RegistrationInput, nikHashes: (string | undefined)[]) {
	return repo.findMatchingMembers({
		nikHashes: nikHashes.flatMap((h) => (h ? [h] : [])),
		emails: data.people.flatMap((p) => (p.email ? [p.email] : [])),
		phones: data.people.flatMap((p) => (p.phone ? [p.phone] : []))
	});
}

// A person matches a member by NIK first, then email, then phone.
function matchFor(person: Person, nikHash: string | undefined, members: Member[]) {
	return (
		(nikHash ? members.find((m) => m.nikHash === nikHash) : undefined) ??
		members.find((m) => person.email && m.email?.toLowerCase() === person.email) ??
		members.find((m) => person.phone && m.phone === person.phone)
	);
}

export function planConsents(
	data: RegistrationInput,
	members: Member[],
	nikHashes: (string | undefined)[]
) {
	return data.people.flatMap((p, personIndex) => {
		const member = matchFor(p, nikHashes[personIndex], members);
		if (!member) return [];
		const token = member.activatedAt ? generateSessionToken() : null;
		return [{ personIndex, member, token }];
	});
}

export function consentMessage(member: Member, registrantName: string, token: string) {
	const channel = member.phone ? ('whatsapp' as const) : ('email' as const);
	return {
		channel,
		to: (channel === 'whatsapp' ? member.phone : member.email)!.toLowerCase(),
		template: 'consent_request' as const,
		locale: member.locale as Locale,
		params: { registrantName, consentUrl: `${config.ORIGIN}/consent/${token}` }
	};
}

// Not awaited: reply timing must not reveal whether anyone matched.
export function deliverLater(ids: string[]) {
	if (!ids.length) return;
	deliverOutbox(ids).catch((err) => console.error('consent delivery failed', (err as Error)?.name));
}
