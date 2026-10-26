import { db } from '$lib/server/db/client';
import { accounts, people, sessions } from '$lib/server/db/schema';
import { roleAssignments } from '$lib/server/db/schema/roles';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { Transaction } from '$lib/server/db/client';

export async function findAccountByIdentifier(identifier: string) {
	const match = identifier.includes('@')
		? sql`lower(${accounts.email}) = lower(${identifier})`
		: eq(accounts.phone, identifier);
	const [account] = await db
		.select({
			personId: accounts.personId,
			passwordHash: accounts.passwordHash,
			status: accounts.status
		})
		.from(accounts)
		.innerJoin(people, eq(people.id, accounts.personId))
		.where(and(match, isNull(people.deletedAt)))
		.limit(1);
	return account ?? null;
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
