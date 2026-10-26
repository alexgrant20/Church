import { and, eq, isNull } from 'drizzle-orm';
import { registrationLinks } from '$lib/server/db/schema';
import type { Transaction } from '$lib/server/db/client';

// Single use is enforced by this one conditional update, not by check-then-write.
export async function claimRegistrationLink(
	tx: Transaction,
	tokenHash: string,
	householdId: string
) {
	const [link] = await tx
		.update(registrationLinks)
		.set({ usedAt: new Date(), householdId })
		.where(
			and(
				eq(registrationLinks.tokenHash, tokenHash),
				isNull(registrationLinks.usedAt),
				isNull(registrationLinks.revokedAt),
				isNull(registrationLinks.deletedAt)
			)
		)
		.returning({ id: registrationLinks.id, branchId: registrationLinks.branchId });
	return link ?? null;
}
