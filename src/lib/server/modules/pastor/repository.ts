import { db } from '$lib/server/db/client';
import { roleAssignments } from '$lib/server/db/schema/roles';
import { and, eq } from 'drizzle-orm';
import type { Transaction } from '$lib/server/db/client';

export async function insertPastorAssignment(
	tx: Transaction,
	data: { personId: string; branchId: string }
) {
	const [assignment] = await tx
		.insert(roleAssignments)
		.values({ personId: data.personId, role: 'pastor', branchId: data.branchId, groupId: null })
		.returning();
	return assignment;
}

export async function findPastorAssignment(personId: string, branchId: string) {
	const [row] = await db
		.select()
		.from(roleAssignments)
		.where(
			and(
				eq(roleAssignments.personId, personId),
				eq(roleAssignments.branchId, branchId),
				eq(roleAssignments.role, 'pastor')
			)
		)
		.limit(1);
	return row ?? null;
}
