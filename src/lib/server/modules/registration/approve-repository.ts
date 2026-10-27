import { and, eq, inArray, isNull, notExists, or, sql } from 'drizzle-orm';
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

// One query for every contact in the registration.
export async function contactTaken(tx: Transaction, emails: string[], phones: string[]) {
	const any = [
		emails.length ? inArray(sql`lower(${accounts.email})`, emails) : undefined,
		phones.length ? inArray(accounts.phone, phones) : undefined
	].filter((c) => c !== undefined);
	if (!any.length) return false;
	const rows = await tx
		.select({ id: accounts.personId })
		.from(accounts)
		.where(or(...any))
		.limit(1);
	return rows.length > 0;
}

export async function movePeople(tx: Transaction, ids: string[], householdId: string) {
	if (!ids.length) return { moved: [], deleted: [] };
	const moved = await tx
		.select({ id: people.id, before: people.householdId })
		.from(people)
		.where(inArray(people.id, ids));
	await tx.update(people).set({ householdId }).where(inArray(people.id, ids));

	// NOT EXISTS: a join cannot express "households left with no live people".
	const deleted = await tx
		.update(households)
		.set({ deletedAt: new Date() })
		.where(
			and(
				inArray(households.id, [...new Set(moved.map((o) => o.before))]),
				isNull(households.deletedAt),
				notExists(
					tx
						.select({ one: sql`1` })
						.from(people)
						.where(and(eq(people.householdId, households.id), isNull(people.deletedAt)))
				)
			)
		)
		.returning({ id: households.id });
	return { moved, deleted: deleted.map((d) => d.id) };
}
