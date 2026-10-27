import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '$lib/server/db/client';
import { errorLogs, loginThrottles, otpCodes, registrationThrottles } from '$lib/server/db/schema';
import { resetDb } from '$lib/server/db/test/reset';
import { makePerson } from '$lib/server/db/test/factories';
import { runJobs } from './jobs';

const ago = (ms: number) => new Date(Date.now() - ms);
const DAY = 86_400_000;
const hash = (c: string) => c.repeat(64);

describe('runJobs', () => {
	beforeEach(resetDb);

	it('purges expired security rows and old error logs', async () => {
		const p = await makePerson();
		const otp = (c: string, createdAt: Date) => ({
			personId: p.id,
			purpose: 'login' as const,
			channel: 'email' as const,
			codeHash: hash('a'),
			challengeHash: hash(c),
			expiresAt: new Date(),
			createdAt
		});
		await db.insert(otpCodes).values([otp('1', ago(2 * DAY)), otp('2', new Date())]);
		await db.insert(loginThrottles).values([
			{ identifierHash: hash('1'), updatedAt: ago(2 * DAY) },
			{ identifierHash: hash('2'), updatedAt: new Date() }
		]);
		await db.insert(registrationThrottles).values([
			{ keyHash: hash('1'), count: 1, windowStartedAt: ago(2 * DAY) },
			{ keyHash: hash('2'), count: 1, windowStartedAt: new Date() }
		]);
		await db.insert(errorLogs).values([
			{ message: 'old', createdAt: ago(40 * DAY) },
			{ message: 'fresh', createdAt: ago(20 * DAY) }
		]);

		await runJobs();

		expect(await db.select().from(otpCodes)).toHaveLength(1);
		expect(await db.select().from(loginThrottles)).toHaveLength(1);
		expect(await db.select().from(registrationThrottles)).toHaveLength(1);
		expect((await db.select().from(errorLogs)).map((r) => r.message)).toEqual(['fresh']);
	});
});
