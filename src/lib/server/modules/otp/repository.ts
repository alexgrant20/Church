import { and, desc, eq, gt, isNull, lt, sql } from 'drizzle-orm';
import type { Transaction } from '$lib/server/db/client';
import { otpCodes } from '$lib/server/db/schema';

type NewCode = typeof otpCodes.$inferInsert;
const MAX_ATTEMPTS = 5;

export async function recentCreatedAt(
	tx: Transaction,
	personId: string,
	purpose: NewCode['purpose'],
	since: Date
): Promise<Date[]> {
	const rows = await tx
		.select({ createdAt: otpCodes.createdAt })
		.from(otpCodes)
		.where(
			and(
				eq(otpCodes.personId, personId),
				eq(otpCodes.purpose, purpose),
				gt(otpCodes.createdAt, since)
			)
		)
		.orderBy(desc(otpCodes.createdAt));
	return rows.map((r) => r.createdAt);
}

export async function consumeLive(
	tx: Transaction,
	personId: string,
	purpose: NewCode['purpose'],
	now: Date
): Promise<void> {
	await tx
		.update(otpCodes)
		.set({ consumedAt: now })
		.where(
			and(
				eq(otpCodes.personId, personId),
				eq(otpCodes.purpose, purpose),
				isNull(otpCodes.consumedAt)
			)
		);
}

export async function insertCode(tx: Transaction, row: NewCode): Promise<void> {
	await tx.insert(otpCodes).values(row);
}

// Counting the attempt in the same statement that checks the limit stops parallel guesses.
export async function countAttempt(
	tx: Transaction,
	challengeHash: string,
	purpose: NewCode['purpose'],
	now: Date
) {
	const [row] = await tx
		.update(otpCodes)
		.set({ attempts: sql`${otpCodes.attempts} + 1` })
		.where(
			and(
				eq(otpCodes.challengeHash, challengeHash),
				eq(otpCodes.purpose, purpose),
				isNull(otpCodes.consumedAt),
				lt(otpCodes.attempts, MAX_ATTEMPTS),
				gt(otpCodes.expiresAt, now)
			)
		)
		.returning({ id: otpCodes.id, codeHash: otpCodes.codeHash, personId: otpCodes.personId });
	return row;
}

export async function markConsumed(tx: Transaction, id: string, now: Date): Promise<boolean> {
	const rows = await tx
		.update(otpCodes)
		.set({ consumedAt: now })
		.where(and(eq(otpCodes.id, id), isNull(otpCodes.consumedAt)))
		.returning({ id: otpCodes.id });
	return rows.length === 1;
}
