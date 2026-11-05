import { and, eq, inArray, isNull, or, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db, type Transaction } from '$lib/server/db/client';
import { people, personRelationships } from '$lib/server/db/schema';
import type { Address } from './life-change-repository';

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
export async function liveSpouseIds(personIds: string[], tx: Transaction | typeof db = db) {
	if (!personIds.length) return new Set<string>();
	const r = personRelationships;
	const rows = await liveSpouseRows(
		tx,
		or(inArray(r.personId, personIds), inArray(r.relatedPersonId, personIds))
	);
	return new Set(rows.flatMap((row) => [row.a, row.b]));
}

// Moves only living people still where they were read; the caller compares the count.
export async function moveAll(
	tx: Transaction,
	moves: { id: string; from: string }[],
	to: string,
	address: Address
) {
	const still = moves.map((m) => and(eq(people.id, m.id), eq(people.householdId, m.from)));
	const rows = await tx
		.update(people)
		.set({ householdId: to, ...address })
		.where(and(or(...still), isNull(people.deceasedOn), isNull(people.deletedAt)))
		.returning({ id: people.id });
	return rows.length;
}
