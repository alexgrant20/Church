import { db } from '$lib/server/db/client';
import { roleAssignments } from '$lib/server/db/schema/roles';
import { and, eq } from 'drizzle-orm';
import type { Transaction } from '$lib/server/db/client';

export async function insertPastorAssignment(
	tx: Transaction,
	data: { userId: string; branchId: string }
) {
	const [assignment] = await tx
		.insert(roleAssignments)
		.values({ userId: data.userId, role: 'pastor', branchId: data.branchId, groupId: null })
		.returning();
	return assignment;
}

export async function findPastorAssignment(userId: string, branchId: string) {
	const [row] = await db
		.select()
		.from(roleAssignments)
		.where(
			and(
				eq(roleAssignments.userId, userId),
				eq(roleAssignments.branchId, branchId),
				eq(roleAssignments.role, 'pastor')
			)
		)
		.limit(1);
	return row ?? null;
}
