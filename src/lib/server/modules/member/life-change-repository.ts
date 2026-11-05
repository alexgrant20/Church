import { and, asc, count, eq, inArray, isNotNull, isNull, or, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
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

// Moves out of one household take turns, so two of them cannot both see "someone stays".
export async function lockHousehold(tx: Transaction, householdId: string) {
	await tx
		.select({ id: households.id })
		.from(households)
		.where(eq(households.id, householdId))
		.for('update');
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

const spouseA = alias(people, 'spouse_a');
const spouseB = alias(people, 'spouse_b');

// A marriage is live while it has not ended and both spouses are alive: a death ends it, and
// undoing the death brings it back, with nothing to restore.
function liveSpouseRows(tx: Transaction | typeof db, where: SQL | undefined) {
	const r = personRelationships;
	return tx
		.select({ a: r.personId, b: r.relatedPersonId })
		.from(r)
		.innerJoin(spouseA, and(eq(spouseA.id, r.personId), isNull(spouseA.deceasedOn)))
		.innerJoin(spouseB, and(eq(spouseB.id, r.relatedPersonId), isNull(spouseB.deceasedOn)))
		.where(and(eq(r.kind, 'spouse'), isNull(r.endedOn), isNull(r.deletedAt), where));
}

export async function hasLiveSpouse(personId: string, tx: Transaction | typeof db = db) {
	const r = personRelationships;
	const rows = await liveSpouseRows(
		tx,
		or(eq(r.personId, personId), eq(r.relatedPersonId, personId))
	).limit(1);
	return rows.length > 0;
}

export type NewPerson = Address & {
	fullName: string;
	nickname: string;
	sex: 'male' | 'female';
	birthDate: string;
	homeBranchId: string;
	householdId: string;
};

export async function insertPerson(tx: Transaction, row: NewPerson) {
	const [p] = await tx
		.insert(people)
		.values({ ...row, isMember: false, memberCode: null })
		.returning({ id: people.id });
	return p.id;
}

// The spouse_order check wants the smaller id first.
export async function insertSpouseLink(tx: Transaction, a: string, b: string, startedOn: string) {
	const [personId, relatedPersonId] = [a, b].sort();
	await tx
		.insert(personRelationships)
		.values({ kind: 'spouse', personId, relatedPersonId, startedOn });
}

// One query for a whole household, so the list never asks per person.
export async function liveSpouseIds(personIds: string[]) {
	if (!personIds.length) return new Set<string>();
	const r = personRelationships;
	const rows = await liveSpouseRows(
		db,
		or(inArray(r.personId, personIds), inArray(r.relatedPersonId, personIds))
	);
	return new Set(rows.flatMap((row) => [row.a, row.b]));
}
