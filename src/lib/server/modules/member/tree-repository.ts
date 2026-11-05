import { and, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import { people, personRelationships } from '$lib/server/db/schema';

// Recursive CTE: a join cannot walk a family of unknown depth. UNION (not UNION ALL) drops ids
// already found, so bad data with a cycle still ends; the walk emits nearest people first.
export async function connectedPersonIds(rootId: string, limit: number): Promise<string[]> {
	const rows = await db.execute<{ id: string }>(sql`
		with recursive tree(id) as (
			select ${rootId}::uuid
			union
			select p.id
			from tree t
			join person_relationships r
				on (r.person_id = t.id or r.related_person_id = t.id) and r.deleted_at is null
			join people p
				on p.id = case when r.person_id = t.id then r.related_person_id else r.person_id end
				and p.deleted_at is null
		)
		select id from tree limit ${limit}
	`);
	return rows.map((r) => r.id);
}

export function treePeople(ids: string[]) {
	if (!ids.length) return Promise.resolve([]);
	return db
		.select({
			id: people.id,
			fullName: people.fullName,
			memberCode: people.memberCode,
			isMember: people.isMember,
			deceasedOn: people.deceasedOn,
			householdId: people.householdId,
			homeBranchId: people.homeBranchId
		})
		.from(people)
		.where(and(inArray(people.id, ids), isNull(people.deletedAt)));
}

export function treeLinks(ids: string[]) {
	if (!ids.length) return Promise.resolve([]);
	const r = personRelationships;
	return db
		.select({
			kind: r.kind,
			personId: r.personId,
			relatedPersonId: r.relatedPersonId,
			endedOn: r.endedOn
		})
		.from(r)
		.where(and(inArray(r.personId, ids), inArray(r.relatedPersonId, ids), isNull(r.deletedAt)));
}
