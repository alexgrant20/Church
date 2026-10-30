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

export async function insertMessages(
	tx: Transaction,
	rows: (typeof outboxMessages.$inferInsert)[]
): Promise<string[]> {
	if (!rows.length) return [];
	const inserted = await tx
		.insert(outboxMessages)
		.values(rows)
		.returning({ id: outboxMessages.id });
	return inserted.map((r) => r.id);
}

// Select-then-update in one transaction: SKIP LOCKED keeps concurrent runs (also in other processes)
// off each other's rows. A single UPDATE ... IN (subquery LIMIT) lets Postgres re-plan the subquery
// as a join and touch more than `limit` rows. The lease also covers a crash mid-send.
export function claimDue(now: Date, leaseUntil: Date, limit: number, ids?: string[]) {
	return db.transaction(async (tx) => {
		const due = await tx
			.select({ id: outboxMessages.id })
			.from(outboxMessages)
			.where(
				and(
					eq(outboxMessages.status, 'pending'),
					lte(outboxMessages.nextAttemptAt, at(now)),
					ids ? inArray(outboxMessages.id, ids) : undefined
				)
			)
			.orderBy(outboxMessages.nextAttemptAt)
			.limit(limit)
			.for('update', { skipLocked: true });
		if (!due.length) return [];
		return tx
			.update(outboxMessages)
			.set({ nextAttemptAt: leaseUntil })
			.where(
				inArray(
					outboxMessages.id,
					due.map((r) => r.id)
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
