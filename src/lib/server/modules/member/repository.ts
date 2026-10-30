import { and, asc, count, eq, ilike, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import { accounts, branches, cities, memberProfiles, people } from '$lib/server/db/schema';
import { columnInScope, type AccessibleBranches } from '$lib/server/modules/branch/access';
import type { Cursor } from '$lib/server/pagination';
import type { MemberFilters } from './filters';

const escapeLike = (s: string) => s.replace(/[\\%_]/g, '\\$&');

function search(q: string) {
	const part = `%${escapeLike(q)}%`;
	return or(
		ilike(people.fullName, part),
		ilike(people.nickname, part),
		ilike(people.chineseName, part),
		ilike(people.memberCode, `${escapeLike(q)}%`)
	);
}

export function memberWhere(filters: MemberFilters, scope: AccessibleBranches) {
	return and(
		eq(people.isMember, true),
		isNull(people.deletedAt),
		filters.status === 'deceased' ? isNotNull(people.deceasedOn) : isNull(people.deceasedOn),
		columnInScope(people.homeBranchId, scope),
		filters.branchId ? eq(people.homeBranchId, filters.branchId) : undefined,
		filters.cityId ? eq(people.cityId, filters.cityId) : undefined,
		filters.q ? search(filters.q) : undefined
	);
}

type ListInput = {
	filters: MemberFilters;
	scope: AccessibleBranches;
	cursor: Cursor | null;
	limit: number;
};

export function listMemberRows({ filters, scope, cursor, limit }: ListInput) {
	const after = cursor
		? sql`(${people.fullName}, ${people.id}) > (${cursor.key}, ${cursor.id}::uuid)`
		: undefined;
	return db
		.select({
			id: people.id,
			memberCode: sql<string>`${people.memberCode}`,
			fullName: people.fullName,
			nickname: people.nickname,
			cityName: cities.name,
			branchName: branches.name,
			deceasedOn: people.deceasedOn
		})
		.from(people)
		.innerJoin(cities, eq(cities.id, people.cityId))
		.innerJoin(branches, eq(branches.id, people.homeBranchId))
		.where(and(memberWhere(filters, scope), after))
		.orderBy(asc(people.fullName), asc(people.id))
		.limit(limit + 1);
}

export function exportMemberRows(filters: MemberFilters, scope: AccessibleBranches, limit: number) {
	return db
		.select({
			memberCode: sql<string>`${people.memberCode}`,
			fullName: people.fullName,
			nickname: people.nickname,
			sex: people.sex,
			birthDate: people.birthDate,
			householdId: people.householdId,
			phone: accounts.phone,
			email: accounts.email,
			city: cities.name,
			homeBranch: branches.name,
			timezone: branches.timezone,
			baptized: sql<boolean>`coalesce(${memberProfiles.baptized}, false)`,
			sidi: sql<boolean>`coalesce(${memberProfiles.sidi}, false)`
		})
		.from(people)
		.innerJoin(cities, eq(cities.id, people.cityId))
		.innerJoin(branches, eq(branches.id, people.homeBranchId))
		.leftJoin(accounts, eq(accounts.personId, people.id))
		.leftJoin(memberProfiles, eq(memberProfiles.personId, people.id))
		.where(memberWhere(filters, scope))
		.orderBy(asc(people.fullName), asc(people.id))
		.limit(limit);
}

export function livingMembersOf(householdIds: string[]) {
	if (!householdIds.length) return Promise.resolve([]);
	return db
		.select({
			householdId: people.householdId,
			memberCode: sql<string>`${people.memberCode}`,
			birthDate: people.birthDate
		})
		.from(people)
		.where(
			and(
				inArray(people.householdId, householdIds),
				eq(people.isMember, true),
				isNull(people.deletedAt),
				isNull(people.deceasedOn)
			)
		);
}

export async function countMemberRows(filters: MemberFilters, scope: AccessibleBranches) {
	const [row] = await db.select({ n: count() }).from(people).where(memberWhere(filters, scope));
	return row.n;
}
