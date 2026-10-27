import { db } from '$lib/server/db/client';
import * as repo from './repository';
import { hashPassword } from './password';
import { generateSessionToken } from './token';
import { ValidationError } from '$lib/server/errors';
import { completeActivationSchema, startActivationSchema } from './schema';
import { normalizeIdentifier } from './identifier';
import { issueOtp, verifyOtp, findChallengePerson } from '$lib/server/modules/otp/service';
import { deliverOtp, otpChannel } from './deliver-otp';
import { recordAudit } from '$lib/server/modules/audit/service';

// Every input gets a token and the same reply, so the screen never shows whether an account exists.
export async function startActivation(input: unknown): Promise<{ challengeToken: string }> {
	const parsed = startActivationSchema.safeParse(input);
	if (!parsed.success) return { challengeToken: generateSessionToken() };
	let normalized;
	try {
		normalized = normalizeIdentifier(parsed.data.identifier);
	} catch (err) {
		if (err instanceof ValidationError) return { challengeToken: generateSessionToken() };
		throw err;
	}
	const account = await repo.findActivatableByIdentifier(normalized);
	if (!account) return { challengeToken: generateSessionToken() };
	// shortcut: the eligible path does one extra insert before replying, a millisecond timing difference; equalize it if activation abuse shows up.
	try {
		return { challengeToken: await sendCode(account) };
	} catch (err) {
		// Resend limits would otherwise tell an outsider the account exists.
		if (err instanceof ValidationError) return { challengeToken: generateSessionToken() };
		throw err;
	}
}

async function sendCode(account: repo.LoginAccount) {
	const { code, challengeToken } = await db.transaction((tx) =>
		issueOtp(tx, {
			personId: account.personId,
			purpose: 'activation',
			channel: otpChannel(account)
		})
	);
	// Not awaited: the reply must not depend on, or time, the provider round trip.
	deliverOtp(account, code).catch((err) =>
		console.error('Activation code delivery failed', err instanceof Error ? err.name : 'unknown')
	);
	return challengeToken;
}

// Failures keep the old token so a live code is not orphaned; ineligible tokens stay silent.
export async function resendActivation(
	challengeToken: string
): Promise<{ challengeToken: string }> {
	const personId = await findChallengePerson(challengeToken, 'activation');
	const account = personId && (await repo.findActivatableByPersonId(personId));
	if (!account) return { challengeToken };
	try {
		return { challengeToken: await sendCode(account) };
	} catch (err) {
		if (err instanceof ValidationError) return { challengeToken };
		throw err;
	}
}

export async function completeActivation(input: unknown): Promise<void> {
	const parsed = completeActivationSchema.safeParse(input);
	if (!parsed.success) throw new ValidationError('error_password_too_short');
	const { challengeToken, code, password } = parsed.data;
	const personId = await verifyOtp({ challengeToken, code, purpose: 'activation' });
	// The account may have been activated, suspended or removed since the code was sent.
	if (!(await repo.findActivatableByPersonId(personId)))
		throw new ValidationError('error_invalid_code');
	const passwordHash = await hashPassword(password);
	await db.transaction(async (tx) => {
		if (!(await repo.setPassword(tx, personId, passwordHash)))
			throw new ValidationError('error_invalid_code');
		await repo.deleteSessionsByPersonId(tx, personId);
		await recordAudit(tx, {
			action: 'account.activated',
			entityType: 'account',
			entityId: personId,
			actorPersonId: personId,
			branchId: null,
			diff: { activated: { before: false, after: true } }
		});
	});
}
