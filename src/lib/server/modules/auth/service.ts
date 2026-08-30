import { db } from '$lib/server/db/client';
import * as repo from './repository';
import { verifyPassword } from './password';
import { generateSessionToken, hashSessionToken } from './token';
import { ValidationError } from '$lib/server/errors';
import { loginSchema } from './schema';
import { recordAudit } from '$lib/server/modules/audit/service';

const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 30;

export async function login(input: unknown, meta: { ip: string }) {
	const { identifier, password } = loginSchema.parse(input);

	const user = await repo.findUserByEmailOrPhone(identifier);
	if (!user || !(await verifyPassword(password, user.passwordHash))) {
		throw new ValidationError('Invalid credentials');
	}

	const token = generateSessionToken();
	const sessionId = hashSessionToken(token);
	const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

	await db.transaction(async (tx) => {
		await repo.insertSession(tx, { id: sessionId, userId: user.id, expiresAt });
		await recordAudit(tx, {
			action: 'auth.login',
			entityType: 'user',
			entityId: user.id,
			actorUserId: user.id,
			branchId: null,
			metadata: { ip: meta.ip }
		});
	});

	return {
		token,
		expiresAt,
		user,
		roleAssignments: await repo.findRoleAssignmentsByUserId(user.id)
	};
}

export async function validateSessionToken(token: string) {
	const row = await repo.findSessionById(hashSessionToken(token));
	if (!row || row.session.expiresAt < new Date()) return { user: null, roleAssignments: [] };
	return { user: row.user, roleAssignments: await repo.findRoleAssignmentsByUserId(row.user.id) };
}

export async function logout(token: string) {
	await repo.deleteSessionById(hashSessionToken(token));
}
