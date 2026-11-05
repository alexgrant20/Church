import { and, asc, count, eq, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm';
import { db, type Transaction } from '$lib/server/db/client';
import { branches, households, people, personRelationships } from '$lib/server/db/schema';

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

// Moves only a living person still in `from`, so a request that lost a race changes nothing.
export async function moveTo(
	tx: Transaction,
	id: string,
	from: string,
	to: string,
	address: Address
) {
	const rows = await tx
		.update(people)
		.set({ householdId: to, ...address })
		.where(
			and(
				eq(people.id, id),
				eq(people.householdId, from),
				isNull(people.deceasedOn),
				isNull(people.deletedAt)
			)
		)
		.returning({ id: people.id });
	return rows.length === 1;
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

// One locking read for every household a change leaves, in id order so two changes cannot deadlock.
export async function lockHouseholds(tx: Transaction, ids: string[]) {
	await tx
		.select({ id: households.id })
		.from(households)
		.where(inArray(households.id, ids))
		.orderBy(asc(households.id))
		.for('update');
}

// Closes, in one statement, each of these households that no living person is left in.
export async function closeEmptyHouseholds(tx: Transaction, ids: string[]) {
	const living = tx
		.select({ id: people.id })
		.from(people)
		.where(
			and(
				eq(people.householdId, households.id),
				isNull(people.deletedAt),
				isNull(people.deceasedOn)
			)
		);
	await tx
		.update(households)
		.set({ deletedAt: new Date() })
		.where(and(inArray(households.id, ids), sql`not exists (${living})`));
}

// Every live parent and spouse row touching these people, for working out how they are related.
export function familyLinks(personIds: string[], tx: Transaction | typeof db = db) {
	const r = personRelationships;
	return tx
		.select({
			kind: r.kind,
			personId: r.personId,
			relatedPersonId: r.relatedPersonId,
			endedOn: r.endedOn
		})
		.from(r)
		.where(
			and(
				isNull(r.deletedAt),
				or(inArray(r.personId, personIds), inArray(r.relatedPersonId, personIds))
			)
		);
}
