import { db } from '$lib/server/db/client';
import { accounts, people, sessions, loginThrottles } from '$lib/server/db/schema';
import { roleAssignments } from '$lib/server/db/schema/roles';
import { and, eq, isNull, sql, type SQL } from 'drizzle-orm';
import type { Transaction } from '$lib/server/db/client';
import { config } from '$lib/server/config';
import type { Identifier } from './identifier';

const LOCK_MS = 2 * 60_000;

const accountColumns = {
	personId: accounts.personId,
	passwordHash: accounts.passwordHash,
	status: accounts.status,
	email: accounts.email,
	phone: accounts.phone,
	activatedAt: accounts.activatedAt,
	preferredLocale: people.preferredLocale
};
export type LoginAccount = NonNullable<Awaited<ReturnType<typeof findAccountByIdentifier>>>;

async function findOneAccount(where: SQL) {
	const [account] = await db
		.select(accountColumns)
		.from(accounts)
		.innerJoin(people, eq(people.id, accounts.personId))
		.where(and(where, isNull(people.deletedAt)))
		.limit(1);
	return account ?? null;
}

export function findAccountByIdentifier(identifier: Identifier) {
	return findOneAccount(
		identifier.kind === 'email'
			? sql`lower(${accounts.email}) = ${identifier.value}`
			: eq(accounts.phone, identifier.value)
	);
}

// Resend only reaches active accounts, same as a fresh login.
export async function findContactByPersonId(personId: string) {
	const account = await findOneAccount(eq(accounts.personId, personId));
	return account?.status === 'active' ? account : null;
}

const activatable = and(isNull(accounts.activatedAt), eq(accounts.status, 'active'));

export async function findActivatableByIdentifier(identifier: Identifier) {
	const account = await findAccountByIdentifier(identifier);
	return account && !account.activatedAt && account.status === 'active' ? account : null;
}

export async function findActivatableByPersonId(personId: string) {
	return findOneAccount(and(eq(accounts.personId, personId), activatable)!);
}

export async function setPassword(tx: Transaction, personId: string, passwordHash: string) {
	const rows = await tx
		.update(accounts)
		.set({ passwordHash, activatedAt: new Date() })
		.where(and(eq(accounts.personId, personId), activatable))
		.returning({ personId: accounts.personId });
	return rows.length === 1;
}

export async function deleteSessionsByPersonId(tx: Transaction, personId: string) {
	await tx.delete(sessions).where(eq(sessions.personId, personId));
}

export async function findLockedUntil(identifierHash: string) {
	const [row] = await db
		.select({ lockedUntil: loginThrottles.lockedUntil })
		.from(loginThrottles)
		.where(eq(loginThrottles.identifierHash, identifierHash));
	return row?.lockedUntil ?? null;
}

// Time is compared on the JS side so tests can fake Date. An expired lock restarts the count.
export async function upsertFailure(identifierHash: string) {
	const now = new Date();
	const count = sql`case when ${loginThrottles.lockedUntil} < ${now.toISOString()}::timestamptz then 1 else ${loginThrottles.failedCount} + 1 end`;
	await db
		.insert(loginThrottles)
		.values({ identifierHash, failedCount: 1 })
		.onConflictDoUpdate({
			target: loginThrottles.identifierHash,
			set: {
				failedCount: count,
				lockedUntil: sql`case when ${count} >= ${config.LOGIN_MAX_FAILED_ATTEMPTS} then ${new Date(now.getTime() + LOCK_MS).toISOString()}::timestamptz else null end`,
				updatedAt: now
			}
		});
}

export async function deleteThrottle(identifierHash: string) {
	await db.delete(loginThrottles).where(eq(loginThrottles.identifierHash, identifierHash));
}

export async function findRoleAssignmentsByPersonId(personId: string) {
	return db
		.select()
		.from(roleAssignments)
		.where(and(eq(roleAssignments.personId, personId), isNull(roleAssignments.deletedAt)));
}

export async function insertSession(
	tx: Transaction,
	data: { id: string; personId: string; expiresAt: Date }
) {
	const [session] = await tx.insert(sessions).values(data).returning();
	return session;
}

export async function touchLastLogin(tx: Transaction, personId: string) {
	await tx.update(accounts).set({ lastLoginAt: new Date() }).where(eq(accounts.personId, personId));
}

export async function findSessionById(sessionId: string) {
	const [row] = await db
		.select({
			expiresAt: sessions.expiresAt,
			actingAsPersonId: sessions.actingAsPersonId,
			personId: people.id,
			fullName: people.fullName
		})
		.from(sessions)
		.innerJoin(people, eq(sessions.personId, people.id))
		.where(and(eq(sessions.id, sessionId), isNull(people.deletedAt)))
		.limit(1);
	return row ?? null;
}

export async function deleteSessionById(sessionId: string) {
	await db.delete(sessions).where(eq(sessions.id, sessionId));
}
