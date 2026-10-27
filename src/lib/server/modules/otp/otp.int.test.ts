import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db } from '$lib/server/db/client';
import { resetDb } from '$lib/server/db/test/reset';
import { makePerson } from '$lib/server/db/test/factories';
import { issueOtp, verifyOtp, type OtpPurpose } from './service';

const issue = (personId: string, purpose: OtpPurpose = 'login') =>
	db.transaction((tx) => issueOtp(tx, { personId, purpose, channel: 'email' }));
const verify = (challengeToken: string, code: string, purpose: OtpPurpose = 'login') =>
	verifyOtp({ challengeToken, purpose, code }).catch((e: unknown) => e as Error);
const wrongOf = (code: string) => (code === '000000' ? '111111' : '000000');
const invalid = { message: 'error_invalid_code' };

describe('otp', () => {
	beforeEach(async () => {
		await resetDb();
		vi.useFakeTimers({ toFake: ['Date'] });
	});
	afterEach(() => vi.useRealTimers());

	it('verifies the right code once', async () => {
		const p = await makePerson();
		const { code, challengeToken } = await issue(p.id);
		expect(await verify(challengeToken, code)).toBe(p.id);
		expect(await verify(challengeToken, code)).toMatchObject(invalid);
	});
	it('rejects after 5 minutes', async () => {
		const p = await makePerson();
		const { code, challengeToken } = await issue(p.id);
		vi.advanceTimersByTime(5 * 60_000 + 1000);
		expect(await verify(challengeToken, code)).toMatchObject(invalid);
	});
	it('dies after 5 wrong tries', async () => {
		const p = await makePerson();
		const { code, challengeToken } = await issue(p.id);
		for (let i = 0; i < 5; i++) await verify(challengeToken, wrongOf(code));
		expect(await verify(challengeToken, code)).toMatchObject(invalid);
	});
	it('counts wrong tries even when the caller transaction fails', async () => {
		const p = await makePerson();
		const { code, challengeToken } = await issue(p.id);
		for (let i = 0; i < 5; i++) {
			await db
				.transaction(async () => {
					await verify(challengeToken, wrongOf(code));
					throw new Error('caller failed');
				})
				.catch(() => {});
		}
		expect(await verify(challengeToken, code)).toMatchObject(invalid);
	});
	it('lets only one of two parallel right codes succeed', async () => {
		const p = await makePerson();
		const { code, challengeToken } = await issue(p.id);
		const results = await Promise.all([verify(challengeToken, code), verify(challengeToken, code)]);
		expect(results.filter((r) => r === p.id)).toHaveLength(1);
		expect(
			results.filter((r) => r instanceof Error && r.message === 'error_invalid_code')
		).toHaveLength(1);
	});
	it('a new code kills the previous one', async () => {
		const p = await makePerson();
		const a = await issue(p.id);
		vi.advanceTimersByTime(61_000);
		const b = await issue(p.id);
		expect(await verify(a.challengeToken, a.code)).toMatchObject(invalid);
		expect(await verify(b.challengeToken, b.code)).toBe(p.id);
	});
	it('refuses a resend within 60 seconds', async () => {
		const p = await makePerson();
		await issue(p.id);
		vi.advanceTimersByTime(30_000);
		await expect(issue(p.id)).rejects.toThrow('error_resend_wait');
	});
	it('caps at 3 codes per 15 minutes', async () => {
		const p = await makePerson();
		for (let i = 0; i < 3; i++) {
			await issue(p.id);
			vi.advanceTimersByTime(61_000);
		}
		await expect(issue(p.id)).rejects.toThrow('error_too_many_codes');
	});
	it('rejects a token for another purpose', async () => {
		const p = await makePerson();
		const { code, challengeToken } = await issue(p.id, 'activation');
		expect(await verify(challengeToken, code, 'login')).toMatchObject(invalid);
	});
});
