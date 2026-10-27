import { db } from '$lib/server/db/client';
import * as repo from './repository';
import { hashPassword, verifyPassword } from './password';
import { generateSessionToken, hashSessionToken } from './token';
import { ValidationError } from '$lib/server/errors';
import { loginSchema } from './schema';
import { normalizeIdentifier } from './identifier';
import { keyedHash } from '$lib/server/crypto';
import { issueOtp, verifyOtp, findChallengePerson } from '$lib/server/modules/otp/service';
import { assertNotLocked, clearFailures, recordFailure } from './throttle';
import { deliverOtp, otpChannel } from './deliver-otp';
import { recordAudit } from '$lib/server/modules/audit/service';

const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 30;

let dummyHashPromise: Promise<string> | undefined;
const dummyHash = () => (dummyHashPromise ??= hashPassword('not-a-real-password'));

// The audit row is written at code verification, so the ip is recorded there; meta stays for the caller contract.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function login(input: unknown, _meta: { ip: string }) {
	const parsed = loginSchema.safeParse(input);
	if (!parsed.success) return rejectMalformed(input);
	const { identifier, password } = parsed.data;
	const normalized = normalizeIdentifier(identifier);
	// Keyed on what was typed, whether or not an account has it, so lockout reveals nothing.
	const throttleKey = keyedHash(normalized.value);
	await assertNotLocked(throttleKey);

	const account = await repo.findAccountByIdentifier(normalized);
	// Same error for unknown, unactivated, suspended and wrong password: never reveal which.
	// Every failure path pays one hash verification so response time does not reveal the account.
	const passwordOk = await verifyPassword(password, account?.passwordHash ?? (await dummyHash()));
	if (!account?.passwordHash || account.status !== 'active' || !passwordOk) {
		await recordFailure(throttleKey);
		throw new ValidationError('error_invalid_credentials');
	}
	await clearFailures(throttleKey);
	return { challengeToken: await sendLoginCode(account) };
}

// Bad input counts as a failed attempt so it cannot be used to probe without limit.
async function rejectMalformed(input: unknown): Promise<never> {
	const identifier = (input as { identifier?: unknown } | null)?.identifier;
	if (typeof identifier === 'string') {
		try {
			const throttleKey = keyedHash(normalizeIdentifier(identifier).value);
			await assertNotLocked(throttleKey);
			await recordFailure(throttleKey);
		} catch (err) {
			if (!(err instanceof ValidationError)) throw err;
			if (err.message === 'error_try_again_later') throw err;
		}
	}
	throw new ValidationError('error_invalid_credentials');
}

async function sendLoginCode(account: repo.LoginAccount): Promise<string> {
	const { code, challengeToken } = await db.transaction((tx) =>
		issueOtp(tx, { personId: account.personId, purpose: 'login', channel: otpChannel(account) })
	);
	await deliverOtp(account, code);
	return challengeToken;
}

export async function resendLoginCode(challengeToken: string) {
	const personId = await findChallengePerson(challengeToken, 'login');
	const account = personId && (await repo.findContactByPersonId(personId));
	if (!account) throw new ValidationError('error_invalid_code');
	return { challengeToken: await sendLoginCode(account) };
}

export async function verifyLogin(
	input: { challengeToken: string; code: string },
	meta?: { ip: string }
) {
	const personId = await verifyOtp({ ...input, purpose: 'login' });
	// The account may have been suspended or removed since the password step.
	const account = await repo.findContactByPersonId(personId);
	if (!account?.activatedAt) throw new ValidationError('error_invalid_code');
	const token = generateSessionToken();
	const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

	await db.transaction(async (tx) => {
		await repo.insertSession(tx, { id: hashSessionToken(token), personId, expiresAt });
		await repo.touchLastLogin(tx, personId);
		await recordAudit(tx, {
			action: 'auth.login',
			entityType: 'person',
			entityId: personId,
			actorPersonId: personId,
			branchId: null,
			metadata: { ip: meta?.ip ?? null }
		});
	});

	return { token, expiresAt };
}

export async function validateSessionToken(token: string) {
	const row = await repo.findSessionById(hashSessionToken(token));
	if (!row || row.expiresAt < new Date()) {
		return { person: null, actingAsPersonId: null, roleAssignments: [] };
	}
	return {
		person: { id: row.personId, fullName: row.fullName },
		actingAsPersonId: row.actingAsPersonId,
		roleAssignments: await repo.findRoleAssignmentsByPersonId(row.personId)
	};
}

export async function logout(token: string) {
	await repo.deleteSessionById(hashSessionToken(token));
}
