import { and, eq, isNull } from 'drizzle-orm';
import type { Transaction } from '$lib/server/db/client';
import { accounts, people, registrationConsents, registrations } from '$lib/server/db/schema';
import { inScope, type BranchScope } from './review-repository';

type Update = Partial<typeof registrations.$inferInsert>;

// The WHERE re-checks status after the row lock, so only one concurrent decision wins.
export async function claimPending(tx: Transaction, id: string, scope: BranchScope, set: Update) {
	const [row] = await tx
		.update(registrations)
		.set(set)
		.where(and(eq(registrations.id, id), eq(registrations.status, 'pending'), inScope(scope)))
		.returning();
	return row;
}

export async function findInScope(tx: Transaction, id: string, scope: BranchScope) {
	const [row] = await tx
		.select({
			id: registrations.id,
			branchId: registrations.branchId,
			status: registrations.status,
			payload: registrations.payload
		})
		.from(registrations)
		.where(and(eq(registrations.id, id), inScope(scope)))
		// Approval claims this row with an UPDATE, so both serialize on the same lock.
		.for('update');
	return row;
}

// FOR UPDATE: a consent decided after this read waits for our commit.
export function lockConsents(tx: Transaction, registrationId: string) {
	return tx
		.select({
			personIndex: registrationConsents.personIndex,
			matchedPersonId: registrationConsents.matchedPersonId,
			decision: registrationConsents.decision
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

export async function markConsentGiven(
	tx: Transaction,
	registrationId: string,
	personIndex: number,
	recordedByPersonId: string | null
) {
	const rows = await tx
		.update(registrationConsents)
		.set({ decision: 'given', decidedAt: new Date(), recordedByPersonId })
		.where(
			and(
				eq(registrationConsents.registrationId, registrationId),
				eq(registrationConsents.personIndex, personIndex),
				eq(registrationConsents.decision, 'waiting'),
				isNull(registrationConsents.deletedAt)
			)
		)
		.returning({ id: registrationConsents.id });
	return rows.length > 0;
}

export async function insertConsent(
	tx: Transaction,
	row: typeof registrationConsents.$inferInsert
) {
	const rows = await tx
		.insert(registrationConsents)
		.values(row)
		.onConflictDoNothing()
		.returning({ id: registrationConsents.id });
	return rows.length > 0;
}

export async function findMemberWithAccount(tx: Transaction, id: string) {
	const [row] = await tx
		.select({
			id: people.id,
			nikHash: people.nikHash,
			locale: people.preferredLocale,
			email: accounts.email,
			phone: accounts.phone,
			activatedAt: accounts.activatedAt
		})
		.from(people)
		.leftJoin(accounts, eq(accounts.personId, people.id))
		.where(and(eq(people.id, id), eq(people.isMember, true), isNull(people.deletedAt)));
	return row;
}
