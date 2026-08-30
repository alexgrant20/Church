import { db } from '$lib/server/db/client';
import { branches } from '$lib/server/db/schema/branch';
import { eq, inArray } from 'drizzle-orm';
import type { Transaction } from '$lib/server/db/client';
import { getAccessibleBranchIds } from './access';

export async function insertBranch(
	tx: Transaction,
	data: { name: string; address: string | null }
) {
	const [branch] = await tx.insert(branches).values(data).returning();
	return branch;
}

export async function findBranchById(id: string) {
	const [branch] = await db.select().from(branches).where(eq(branches.id, id)).limit(1);
	return branch ?? null;
}

export async function listAccessibleBranches() {
	const accessible = getAccessibleBranchIds();
	if (accessible === 'all') return db.select().from(branches);
	if (accessible.length === 0) return [];
	return db.select().from(branches).where(inArray(branches.id, accessible));
}
