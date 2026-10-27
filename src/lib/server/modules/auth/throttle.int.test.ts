import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db } from '$lib/server/db/client';
import { loginThrottles } from '$lib/server/db/schema';
import { resetDb } from '$lib/server/db/test/reset';
import { assertNotLocked, clearFailures, recordFailure } from './throttle';

const hash = 'a'.repeat(64);

describe('login throttle', () => {
	beforeEach(async () => {
		await resetDb();
		vi.useFakeTimers({ toFake: ['Date'] });
	});
	afterEach(() => vi.useRealTimers());

	it('locks after 5 failures for 2 minutes', async () => {
		for (let i = 0; i < 4; i++) await recordFailure(hash);
		await expect(assertNotLocked(hash)).resolves.toBeUndefined();
		await recordFailure(hash);
		await expect(assertNotLocked(hash)).rejects.toThrow('error_try_again_later');
		vi.advanceTimersByTime(2 * 60_000 + 1000);
		await expect(assertNotLocked(hash)).resolves.toBeUndefined();
	});
	it('starts counting afresh once a lock has expired', async () => {
		for (let i = 0; i < 5; i++) await recordFailure(hash);
		vi.advanceTimersByTime(2 * 60_000 + 1000);
		await recordFailure(hash);
		await expect(assertNotLocked(hash)).resolves.toBeUndefined();
	});
	it('clears the row', async () => {
		await recordFailure(hash);
		await clearFailures(hash);
		expect(await db.select().from(loginThrottles)).toEqual([]);
	});
});
