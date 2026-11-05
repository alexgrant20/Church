import { and, asc, count, eq, isNotNull, isNull } from 'drizzle-orm';
import { db, type Transaction } from '$lib/server/db/client';
import { branches, households, people } from '$lib/server/db/schema';

export type Address = { addressLine: string; postalCode: string | null; cityId: string };

const subjectColumns = {
	id: people.id,
	fullName: people.fullName,
	householdId: people.householdId,
	homeBranchId: people.homeBranchId,
	birthDate: people.birthDate,
	deceasedOn: people.deceasedOn,
	addressLine: people.addressLine,
	postalCode: people.postalCode,
	cityId: people.cityId,
	timezone: branches.timezone
};

export async function findSubject(id: string) {
	const [row] = await db
		.select(subjectColumns)
		.from(people)
		.innerJoin(branches, eq(branches.id, people.homeBranchId))
		.where(and(eq(people.id, id), isNull(people.deletedAt)));
	return row;
}

export function householdMembers(householdId: string) {
	return db
		.select(subjectColumns)
		.from(people)
		.innerJoin(branches, eq(branches.id, people.homeBranchId))
		.where(and(eq(people.householdId, householdId), isNull(people.deletedAt)))
		.orderBy(asc(people.birthDate), asc(people.id));
}

export type Subject = NonNullable<Awaited<ReturnType<typeof findSubject>>>;

export async function livePeopleIn(householdId: string, tx: Transaction | typeof db = db) {
	const [row] = await tx
		.select({ n: count() })
		.from(people)
		.where(
			and(eq(people.householdId, householdId), isNull(people.deletedAt), isNull(people.deceasedOn))
		);
	return row.n;
}

// Guarded on the expected state, so of two racing writes only one changes the row.
export async function setDeceasedOn(
	tx: Transaction,
	id: string,
	date: string | null,
	expected: 'alive' | 'deceased'
) {
	const guard = expected === 'alive' ? isNull(people.deceasedOn) : isNotNull(people.deceasedOn);
	const rows = await tx
		.update(people)
		.set({ deceasedOn: date })
		.where(and(eq(people.id, id), guard))
		.returning({ id: people.id });
	return rows.length === 1;
}

export async function insertHousehold(tx: Transaction) {
	const [row] = await tx.insert(households).values({}).returning({ id: households.id });
	return row.id;
}

export async function moveTo(tx: Transaction, id: string, householdId: string, address: Address) {
	await tx
		.update(people)
		.set({ householdId, ...address })
		.where(eq(people.id, id));
}

export async function softDeleteHousehold(tx: Transaction, householdId: string) {
	await tx.update(households).set({ deletedAt: new Date() }).where(eq(households.id, householdId));
}

export async function householdExists(householdId: string) {
	const [row] = await db
		.select({ id: households.id })
		.from(households)
		.where(and(eq(households.id, householdId), isNull(households.deletedAt)));
	return row !== undefined;
}
