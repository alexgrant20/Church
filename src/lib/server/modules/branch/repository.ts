import { db } from '$lib/server/db/client';
import { branches } from '$lib/server/db/schema/branch';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { Transaction } from '$lib/server/db/client';
import { getAccessibleBranchIds } from './access';
import type { CreateBranchInput } from './schema';

export async function insertBranch(tx: Transaction, data: CreateBranchInput) {
	const [branch] = await tx.insert(branches).values(data).returning();
	return branch;
}

export async function findBranchById(id: string) {
	const [branch] = await db
		.select()
		.from(branches)
		.where(and(eq(branches.id, id), isNull(branches.deletedAt)))
		.limit(1);
	return branch ?? null;
}

export async function listAccessibleBranches() {
	const accessible = getAccessibleBranchIds();
	if (accessible !== 'all' && accessible.length === 0) return [];
	const live = isNull(branches.deletedAt);
	return db
		.select({ id: branches.id, code: branches.code, name: branches.name })
		.from(branches)
		.where(accessible === 'all' ? live : and(live, inArray(branches.id, accessible)))
		.orderBy(branches.name, branches.id);
}
