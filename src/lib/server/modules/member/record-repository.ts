import { and, eq, inArray, isNull, ne, or } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db } from '$lib/server/db/client';
import {
	accounts,
	branches,
	cities,
	memberProfiles,
	people,
	personRelationships,
	regions
} from '$lib/server/db/schema';

const birthCities = alias(cities, 'birth_cities');

export async function findPersonDetail(id: string) {
	const [row] = await db
		.select({
			person: people,
			city: cities.name,
			region: regions.name,
			birthCity: birthCities.name,
			homeBranch: branches.name,
			profile: memberProfiles,
			email: accounts.email,
			phone: accounts.phone,
			activatedAt: accounts.activatedAt
		})
		.from(people)
		.innerJoin(cities, eq(cities.id, people.cityId))
		.innerJoin(regions, eq(regions.id, cities.regionId))
		.innerJoin(branches, eq(branches.id, people.homeBranchId))
		.leftJoin(birthCities, eq(birthCities.id, people.birthCityId))
		.leftJoin(memberProfiles, eq(memberProfiles.personId, people.id))
		.leftJoin(accounts, eq(accounts.personId, people.id))
		.where(and(eq(people.id, id), isNull(people.deletedAt)));
	return row;
}

const relativeColumns = {
	id: people.id,
	fullName: people.fullName,
	memberCode: people.memberCode,
	homeBranchId: people.homeBranchId,
	householdId: people.householdId,
	deceasedOn: people.deceasedOn
};

export function householdPeople(householdId: string, exceptId: string) {
	return db
		.select(relativeColumns)
		.from(people)
		.where(
			and(eq(people.householdId, householdId), ne(people.id, exceptId), isNull(people.deletedAt))
		);
}

// Joins the other end of each live relationship row, whichever side the person is on.
export function relationshipsOf(personId: string) {
	const r = personRelationships;
	return db
		.select({ ...relativeColumns, kind: r.kind, parentId: r.personId, endedOn: r.endedOn })
		.from(r)
		.innerJoin(
			people,
			or(
				and(eq(r.personId, personId), eq(people.id, r.relatedPersonId)),
				and(eq(r.relatedPersonId, personId), eq(people.id, r.personId))
			)
		)
		.where(and(isNull(r.deletedAt), isNull(people.deletedAt)));
}

export async function householdBranchIds(householdIds: string[]) {
	if (!householdIds.length) return [];
	return db
		.selectDistinct({ householdId: people.householdId, homeBranchId: people.homeBranchId })
		.from(people)
		.where(and(inArray(people.householdId, householdIds), isNull(people.deletedAt)));
}
