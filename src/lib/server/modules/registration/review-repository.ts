import { and, asc, count, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import { branches, registrationConsents, registrations } from '$lib/server/db/schema';
import type { Cursor } from '$lib/server/pagination';

export type BranchScope = 'all' | string[];

export const inScope = (scope: BranchScope) =>
	scope === 'all' ? undefined : scope.length ? inArray(registrations.branchId, scope) : sql`false`;

type Queue = {
	status: 'pending' | 'needs_fix';
	scope: BranchScope;
	cursor: Cursor | null;
	limit: number;
};

export function listQueue({ status, scope, cursor, limit }: Queue) {
	const after = cursor
		? sql`(${registrations.submittedAt}, ${registrations.id}) > (${cursor.key}::timestamptz, ${cursor.id}::uuid)`
		: undefined;
	return db
		.select({
			id: registrations.id,
			registrantName: sql<string>`${registrations.payload}->'people'->0->>'fullName'`,
			peopleCount: sql<number>`jsonb_array_length(${registrations.payload}->'people')::int`,
			submittedAt: registrations.submittedAt,
			// Text keeps the microseconds that a JS Date would round off the cursor.
			cursorKey: sql<string>`${registrations.submittedAt}::text`,
			waitingConsents: sql<number>`(count(${registrationConsents.id}) filter (where ${registrationConsents.decision} = 'waiting'))::int`
		})
		.from(registrations)
		.leftJoin(
			registrationConsents,
			and(
				eq(registrationConsents.registrationId, registrations.id),
				isNull(registrationConsents.deletedAt)
			)
		)
		.where(and(eq(registrations.status, status), inScope(scope), after))
		.groupBy(registrations.id)
		.orderBy(asc(registrations.submittedAt), asc(registrations.id))
		.limit(limit + 1);
}

export async function countPending(scope: BranchScope): Promise<number> {
	const [row] = await db
		.select({ n: count() })
		.from(registrations)
		.where(and(eq(registrations.status, 'pending'), inScope(scope)));
	return row.n;
}

export async function findDetail(id: string, scope: BranchScope) {
	const [row] = await db
		.select({
			id: registrations.id,
			status: registrations.status,
			payload: registrations.payload,
			fixReason: registrations.fixReason,
			submittedAt: registrations.submittedAt,
			branchName: branches.name
		})
		.from(registrations)
		.innerJoin(branches, eq(branches.id, registrations.branchId))
		.where(and(eq(registrations.id, id), inScope(scope)));
	return row;
}

export function consentsOf(registrationId: string) {
	return db
		.select({
			personIndex: registrationConsents.personIndex,
			decision: registrationConsents.decision,
			inPersonOnly: sql<boolean>`${registrationConsents.tokenHash} is null`
		})
		.from(registrationConsents)
		.where(
			and(
				eq(registrationConsents.registrationId, registrationId),
				isNull(registrationConsents.deletedAt)
			)
		);
}

type Candidate = { fullName: string; birthDate: string };

// One query for the whole registration: people joined to a VALUES list of its candidates.
export async function findSameNameAndBirth(candidates: Candidate[]) {
	if (!candidates.length) return [];
	const values = sql.join(
		candidates.map(
			(c, i) => sql`(${i}::int, lower(trim(${c.fullName}::text)), ${c.birthDate}::date)`
		),
		sql`, `
	);
	return db.execute<{
		idx: number;
		id: string;
		memberCode: string;
		fullName: string;
		homeBranchId: string;
	}>(sql`
		select v.idx, p.id, p.member_code as "memberCode", p.full_name as "fullName", p.home_branch_id as "homeBranchId"
		from (values ${values}) as v(idx, name, birth)
		join people p on lower(trim(p.full_name)) = v.name and p.birth_date = v.birth
		where p.deleted_at is null and p.is_member
	`);
}
