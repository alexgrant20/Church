import { timingSafeEqual } from 'node:crypto';
import type { Transaction } from '$lib/server/db/client';
import { keyedHash } from '$lib/server/crypto';
import { ValidationError } from '$lib/server/errors';
import { generateSessionToken, hashSessionToken } from '$lib/server/modules/auth/token';
import type { Channel } from '$lib/server/modules/messaging/sender';
import { generateOtpCode } from './code';
import * as repo from './repository';

export type OtpPurpose = 'login' | 'activation' | 'password_reset';

export const OTP_TTL_MS = 5 * 60_000;
export const OTP_RESEND_AFTER_MS = 60_000;
const WINDOW_MS = 15 * 60_000;
const MAX_CODES_PER_WINDOW = 3;

export async function issueOtp(
	tx: Transaction,
	input: { personId: string; purpose: OtpPurpose; channel: Channel }
): Promise<{ code: string; challengeToken: string }> {
	const now = new Date();
	const recent = await repo.recentCreatedAt(
		tx,
		input.personId,
		input.purpose,
		new Date(now.getTime() - WINDOW_MS)
	);
	if (recent[0] && now.getTime() - recent[0].getTime() < OTP_RESEND_AFTER_MS)
		throw new ValidationError('error_resend_wait');
	if (recent.length >= MAX_CODES_PER_WINDOW) throw new ValidationError('error_too_many_codes');

	const code = generateOtpCode();
	const challengeToken = generateSessionToken();
	await repo.consumeLive(tx, input.personId, input.purpose, now);
	await repo.insertCode(tx, {
		...input,
		codeHash: keyedHash(code),
		challengeHash: hashSessionToken(challengeToken),
		expiresAt: new Date(now.getTime() + OTP_TTL_MS),
		createdAt: now
	});
	return { code, challengeToken };
}

// Throws after counting a wrong attempt, so the caller must not roll that count back.
export async function verifyOtp(
	tx: Transaction,
	input: { challengeToken: string; purpose: OtpPurpose; code: string }
): Promise<string> {
	const now = new Date();
	const row = await repo.countAttempt(
		tx,
		hashSessionToken(input.challengeToken),
		input.purpose,
		now
	);
	if (!row) throw new ValidationError('error_invalid_code');
	if (!timingSafeEqual(Buffer.from(keyedHash(input.code)), Buffer.from(row.codeHash)))
		throw new ValidationError('error_invalid_code');
	await repo.markConsumed(tx, row.id, now);
	return row.personId;
}
