import { and, eq, isNull } from 'drizzle-orm';
import { db, type Transaction } from '$lib/server/db/client';
import { branches, registrationLinks } from '$lib/server/db/schema';

const live = and(isNull(registrationLinks.revokedAt), isNull(registrationLinks.deletedAt));

export async function findLiveLink(branchId: string) {
	const [link] = await db
		.select({
			id: registrationLinks.id,
			tokenEncrypted: registrationLinks.tokenEncrypted
		})
		.from(registrationLinks)
		.where(and(eq(registrationLinks.branchId, branchId), live))
		.limit(1);
	return link ?? null;
}

// Serializes rotations of one branch so concurrent calls queue instead of colliding.
export async function lockBranch(tx: Transaction, branchId: string) {
	await tx
		.select({ id: branches.id })
		.from(branches)
		.where(eq(branches.id, branchId))
		.for('update');
}

export async function revokeLiveLink(tx: Transaction, branchId: string) {
	const [revoked] = await tx
		.update(registrationLinks)
		.set({ revokedAt: new Date() })
		.where(and(eq(registrationLinks.branchId, branchId), live))
		.returning({ id: registrationLinks.id });
	return revoked ?? null;
}

type NewLink = {
	branchId: string;
	createdByPersonId: string;
	tokenHash: string;
	tokenEncrypted: Buffer;
};

// Returns null when the branch already has a live link (the partial unique index decides).
export async function insertLink(tx: Transaction, data: NewLink) {
	const [row] = await tx
		.insert(registrationLinks)
		.values(data)
		.onConflictDoNothing()
		.returning({ id: registrationLinks.id });
	return row ?? null;
}

export async function findLinkByHash(tokenHash: string) {
	const [row] = await db
		.select({
			linkId: registrationLinks.id,
			branchId: registrationLinks.branchId,
			branchName: branches.name
		})
		.from(registrationLinks)
		.innerJoin(branches, eq(branches.id, registrationLinks.branchId))
		.where(and(eq(registrationLinks.tokenHash, tokenHash), live))
		.limit(1);
	return row ?? null;
}
