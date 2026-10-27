import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db, type Transaction } from '$lib/server/db/client';
import { branches, registrationConsents, registrations } from '$lib/server/db/schema';

type Update = Partial<typeof registrations.$inferInsert>;

export async function findByFixToken(tokenHash: string) {
	const [row] = await db
		.select({
			id: registrations.id,
			payload: registrations.payload,
			fixReason: registrations.fixReason,
			branchName: branches.name
		})
		.from(registrations)
		.innerJoin(branches, eq(branches.id, registrations.branchId))
		.where(and(eq(registrations.fixTokenHash, tokenHash), eq(registrations.status, 'needs_fix')));
	return row;
}

// The WHERE spends the token: a second resubmit with the same link finds no row.
export async function claimFix(tx: Transaction, tokenHash: string, set: Update) {
	const [row] = await tx
		.update(registrations)
		.set(set)
		.where(and(eq(registrations.fixTokenHash, tokenHash), eq(registrations.status, 'needs_fix')))
		.returning({ id: registrations.id, branchId: registrations.branchId });
	return row;
}

export function lockLiveConsents(tx: Transaction, registrationId: string) {
	return tx
		.select({
			id: registrationConsents.id,
			personIndex: registrationConsents.personIndex,
			matchedPersonId: registrationConsents.matchedPersonId
		})
		.from(registrationConsents)
		.where(
			and(
				eq(registrationConsents.registrationId, registrationId),
				isNull(registrationConsents.deletedAt)
			)
		)
		.for('update');
}

export async function softDeleteConsents(tx: Transaction, ids: string[], now: Date) {
	if (!ids.length) return;
	await tx
		.update(registrationConsents)
		.set({ deletedAt: now })
		.where(inArray(registrationConsents.id, ids));
}

export async function findWaitingConsent(tokenHash: string) {
	const [row] = await db
		.select({
			registrationId: registrationConsents.registrationId,
			matchedPersonId: registrationConsents.matchedPersonId,
			registrantName: sql<string>`${registrations.payload}->'people'->0->>'fullName'`,
			branchName: branches.name,
			status: registrations.status
		})
		.from(registrationConsents)
		.innerJoin(registrations, eq(registrations.id, registrationConsents.registrationId))
		.innerJoin(branches, eq(branches.id, registrations.branchId))
		.where(
			and(
				eq(registrationConsents.tokenHash, tokenHash),
				eq(registrationConsents.decision, 'waiting'),
				isNull(registrationConsents.deletedAt)
			)
		);
	return row;
}

// Approval locks the same row, so a consent and an approval never interleave.
export async function lockRegistration(tx: Transaction, id: string) {
	const [row] = await tx
		.select({ status: registrations.status, branchId: registrations.branchId })
		.from(registrations)
		.where(eq(registrations.id, id))
		.for('update');
	return row;
}

export async function decideWaiting(
	tx: Transaction,
	tokenHash: string,
	decision: 'given' | 'declined',
	now: Date
) {
	const [row] = await tx
		.update(registrationConsents)
		.set({ decision, decidedAt: now })
		.where(
			and(
				eq(registrationConsents.tokenHash, tokenHash),
				eq(registrationConsents.decision, 'waiting'),
				isNull(registrationConsents.deletedAt)
			)
		)
		.returning({ personIndex: registrationConsents.personIndex });
	return row;
}
