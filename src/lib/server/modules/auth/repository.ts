import { db } from '$lib/server/db/client';
import { users, sessions } from '$lib/server/db/schema/auth';
import { roleAssignments } from '$lib/server/db/schema/roles';
import { eq } from 'drizzle-orm';
import type { Transaction } from '$lib/server/db/client';

export async function findUserByEmailOrPhone(identifier: string) {
	const [user] = await db.select().from(users).where(eq(users.email, identifier)).limit(1);
	return user ?? null;
}

export async function findRoleAssignmentsByUserId(userId: string) {
	return db.select().from(roleAssignments).where(eq(roleAssignments.userId, userId));
}

export async function insertSession(
	tx: Transaction,
	data: { id: string; userId: string; expiresAt: Date }
) {
	const [session] = await tx.insert(sessions).values(data).returning();
	return session;
}

export async function findSessionById(sessionId: string) {
	const [row] = await db
		.select({ session: sessions, user: users })
		.from(sessions)
		.innerJoin(users, eq(sessions.userId, users.id))
		.where(eq(sessions.id, sessionId))
		.limit(1);
	return row ?? null;
}

export async function deleteSessionById(sessionId: string) {
	await db.delete(sessions).where(eq(sessions.id, sessionId));
}
