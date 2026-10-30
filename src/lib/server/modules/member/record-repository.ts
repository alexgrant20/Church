import { and, inArray, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import { people } from '$lib/server/db/schema';

export async function householdBranchIds(householdIds: string[]) {
	if (!householdIds.length) return [];
	return db
		.selectDistinct({ householdId: people.householdId, homeBranchId: people.homeBranchId })
		.from(people)
		.where(and(inArray(people.householdId, householdIds), isNull(people.deletedAt)));
}
