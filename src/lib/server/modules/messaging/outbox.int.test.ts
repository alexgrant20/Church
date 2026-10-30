import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import { outboxMessages } from '$lib/server/db/schema';
import { resetDb } from '$lib/server/db/test/reset';

vi.mock('./sender', async (orig) => ({ ...(await orig<object>()), sendMessage: vi.fn() }));

import { DeliveryError, sendMessage, type OutgoingMessage } from './sender';
import { deliverOutbox, enqueueMessage, enqueueMessages } from './outbox';

const msg: OutgoingMessage = {
	channel: 'email',
	to: 'a@mail.test',
	template: 'consent_request',
	locale: 'en',
	params: { registrantName: 'Ann', consentUrl: 'https://x.test/c/1' }
};
const send = vi.mocked(sendMessage);
const rows = () => db.select().from(outboxMessages);
const enqueue = () => db.transaction((tx) => enqueueMessage(tx, msg));

describe('outbox', () => {
	beforeEach(async () => {
		await resetDb();
		send.mockReset();
	});
	afterEach(() => vi.useRealTimers());

	it('a rolled-back transaction leaves no message', async () => {
		await expect(
			db.transaction(async (tx) => {
				await enqueueMessage(tx, msg);
				throw new Error('boom');
			})
		).rejects.toThrow('boom');
		expect(await rows()).toHaveLength(0);
	});

	it('enqueueMessages inserts all rows in one call and none for an empty list', async () => {
		const ids = await db.transaction((tx) => enqueueMessages(tx, [msg, msg, msg]));
		expect(ids).toHaveLength(3);
		expect(await rows()).toHaveLength(3);
		expect(await db.transaction((tx) => enqueueMessages(tx, []))).toEqual([]);
	});

	it('delivers and marks sent', async () => {
		const id = await enqueue();
		await deliverOutbox();
		expect(send).toHaveBeenCalledWith(msg);
		const [row] = await db.select().from(outboxMessages).where(eq(outboxMessages.id, id));
		expect(row.status).toBe('sent');
		expect(row.sentAt).not.toBeNull();
	});

	it('sends each due message exactly once across parallel runs', async () => {
		await enqueue();
		await enqueue();
		await Promise.all([deliverOutbox(), deliverOutbox()]);
		expect(send).toHaveBeenCalledTimes(2);
	});

	it('claims at most 20 rows per run', async () => {
		for (let i = 0; i < 25; i++) await enqueue();
		await deliverOutbox();
		expect(send).toHaveBeenCalledTimes(20);
		await deliverOutbox();
		expect(send).toHaveBeenCalledTimes(25);
	});

	it('never sends a row twice when a slow run overlaps the next one', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
		for (let i = 0; i < 25; i++) {
			await db.transaction((tx) => enqueueMessage(tx, { ...msg, to: `r${i}@mail.test` }));
		}
		let release!: () => void;
		send.mockImplementationOnce(() => new Promise<void>((r) => (release = r)));
		const first = deliverOutbox();
		// Past the lease, so only a run guard keeps the second run off the first run's rows.
		vi.setSystemTime(new Date('2026-01-01T00:10:00Z'));
		const second = deliverOutbox();
		await new Promise((r) => setTimeout(r, 200));
		release();
		await Promise.all([first, second]);
		const recipients = send.mock.calls.map(([m]) => m.to);
		expect(recipients).toHaveLength(25);
		expect(new Set(recipients).size).toBe(25);
	});

	it('retries with backoff and gives up after 5', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
		send.mockRejectedValue(new DeliveryError('SMTP send failed'));
		await enqueue();

		await deliverOutbox();
		let [row] = await rows();
		expect(row.attempts).toBe(1);
		expect(row.lastError).toBe('SMTP send failed');
		expect(row.nextAttemptAt.getTime()).toBe(Date.parse('2026-01-01T00:05:00Z'));

		await deliverOutbox();
		expect(send).toHaveBeenCalledTimes(1);

		for (let i = 2; i <= 5; i++) {
			vi.setSystemTime(Date.now() + 30 * 60_000);
			await deliverOutbox();
		}
		[row] = await rows();
		expect(row.attempts).toBe(5);
		expect(row.status).toBe('failed');
		vi.setSystemTime(Date.now() + 60 * 60_000);
		await deliverOutbox();
		expect(send).toHaveBeenCalledTimes(5);
	});
});
