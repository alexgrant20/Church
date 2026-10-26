import { sql } from 'drizzle-orm';
import { memberCodeCounters } from '$lib/server/db/schema';
import type { Transaction } from '$lib/server/db/client';

// One upsert hands out the number, so concurrent registrations never share one.
export async function nextMemberCode(
	tx: Transaction,
	branch: { id: string; code: string },
	year: number
): Promise<string> {
	const [row] = await tx
		.insert(memberCodeCounters)
		.values({ branchId: branch.id, year, lastNumber: 1 })
		.onConflictDoUpdate({
			target: [memberCodeCounters.branchId, memberCodeCounters.year],
			set: { lastNumber: sql`${memberCodeCounters.lastNumber} + 1` }
		})
		.returning({ lastNumber: memberCodeCounters.lastNumber });
	return `${branch.code}-${year}-${String(row.lastNumber).padStart(5, '0')}`;
}
