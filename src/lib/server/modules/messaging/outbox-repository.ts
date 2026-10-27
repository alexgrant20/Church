import { and, eq, inArray, lte, sql } from 'drizzle-orm';
import { db, type Transaction } from '$lib/server/db/client';
import { outboxMessages } from '$lib/server/db/schema';

// Time is compared on the JS side so tests can fake Date.
const at = (d: Date) => sql`${d.toISOString()}::timestamptz`;

export async function insertMessage(
	tx: Transaction,
	row: typeof outboxMessages.$inferInsert
): Promise<string> {
	const [{ id }] = await tx.insert(outboxMessages).values(row).returning({ id: outboxMessages.id });
	return id;
}

// One conditional UPDATE is the claim: a concurrent run re-checks the WHERE after the row lock,
// sees the pushed-out nextAttemptAt and skips the row. The lease also covers a crash mid-send.
export function claimDue(now: Date, leaseUntil: Date, ids?: string[]) {
	return db
		.update(outboxMessages)
		.set({ nextAttemptAt: leaseUntil })
		.where(
			and(
				eq(outboxMessages.status, 'pending'),
				lte(outboxMessages.nextAttemptAt, at(now)),
				ids ? inArray(outboxMessages.id, ids) : undefined
			)
		)
		.returning({
			id: outboxMessages.id,
			channel: outboxMessages.channel,
			recipient: outboxMessages.recipient,
			template: outboxMessages.template,
			locale: outboxMessages.locale,
			params: outboxMessages.params,
			attempts: outboxMessages.attempts
		});
}

export async function markSent(id: string, now: Date): Promise<void> {
	await db
		.update(outboxMessages)
		.set({ status: 'sent', sentAt: now })
		.where(eq(outboxMessages.id, id));
}

export async function markFailedAttempt(
	id: string,
	f: { attempts: number; lastError: string; nextAttemptAt: Date; giveUp: boolean }
): Promise<void> {
	await db
		.update(outboxMessages)
		.set({
			attempts: f.attempts,
			lastError: f.lastError,
			nextAttemptAt: f.nextAttemptAt,
			status: f.giveUp ? 'failed' : 'pending'
		})
		.where(eq(outboxMessages.id, id));
}
