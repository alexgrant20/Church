import { and, eq, inArray, isNull, notExists, sql } from 'drizzle-orm';
import type { Transaction } from '$lib/server/db/client';
import {
	accounts,
	branches,
	households,
	memberProfiles,
	people,
	personRelationships
} from '$lib/server/db/schema';

export async function insertHousehold(tx: Transaction): Promise<string> {
	const [{ id }] = await tx.insert(households).values({}).returning({ id: households.id });
	return id;
}

export async function findBranch(tx: Transaction, id: string) {
	const [row] = await tx
		.select({ id: branches.id, code: branches.code })
		.from(branches)
		.where(eq(branches.id, id));
	return row;
}

// Returned ids follow the order of `rows`.
export async function insertPeople(tx: Transaction, rows: (typeof people.$inferInsert)[]) {
	if (!rows.length) return [];
	const inserted = await tx.insert(people).values(rows).returning({ id: people.id });
	return inserted.map((r) => r.id);
}

export async function insertProfiles(
	tx: Transaction,
	rows: (typeof memberProfiles.$inferInsert)[]
) {
	if (rows.length) await tx.insert(memberProfiles).values(rows);
}

export async function insertAccounts(tx: Transaction, rows: (typeof accounts.$inferInsert)[]) {
	if (rows.length) await tx.insert(accounts).values(rows);
}

// A linked person may already have this row from an earlier registration.
export async function insertRelationships(
	tx: Transaction,
	rows: (typeof personRelationships.$inferInsert)[]
) {
	if (rows.length) await tx.insert(personRelationships).values(rows).onConflictDoNothing();
}

export async function setRegisteredBy(tx: Transaction, ids: string[], registrantId: string) {
	if (!ids.length) return;
	await tx
		.update(people)
		.set({ registeredByPersonId: registrantId })
		.where(inArray(people.id, ids));
}

export async function movePeople(tx: Transaction, ids: string[], householdId: string) {
	if (!ids.length) return;
	const old = await tx
		.select({ id: people.householdId })
		.from(people)
		.where(inArray(people.id, ids));
	await tx.update(people).set({ householdId }).where(inArray(people.id, ids));
	// NOT EXISTS: a join cannot express "households left with no live people".
	await tx
		.update(households)
		.set({ deletedAt: new Date() })
		.where(
			and(
				inArray(households.id, [...new Set(old.map((o) => o.id))]),
				isNull(households.deletedAt),
				notExists(
					tx
						.select({ one: sql`1` })
						.from(people)
						.where(and(eq(people.householdId, households.id), isNull(people.deletedAt)))
				)
			)
		);
}
