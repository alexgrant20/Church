import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import { outboxMessages } from '$lib/server/db/schema';
import { resetDb } from '$lib/server/db/test/reset';

vi.mock('./sender', async (orig) => ({ ...(await orig<object>()), sendMessage: vi.fn() }));

import { DeliveryError, sendMessage, type OutgoingMessage } from './sender';
import { deliverOutbox, enqueueMessage } from './outbox';

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
