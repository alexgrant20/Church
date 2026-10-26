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

	const account = await repo.findAccountByIdentifier(identifier);
	// Same error for unknown, unactivated, suspended and wrong password: never reveal which.
	if (
		!account?.passwordHash ||
		account.status !== 'active' ||
		!(await verifyPassword(password, account.passwordHash))
	) {
		throw new ValidationError('Invalid credentials');
	}

	const token = generateSessionToken();
	const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

	await db.transaction(async (tx) => {
		await repo.insertSession(tx, {
			id: hashSessionToken(token),
			personId: account.personId,
			expiresAt
		});
		await repo.touchLastLogin(tx, account.personId);
		await recordAudit(tx, {
			action: 'auth.login',
			entityType: 'person',
			entityId: account.personId,
			actorPersonId: account.personId,
			branchId: null,
			metadata: { ip: meta.ip }
		});
	});

	return { token, expiresAt };
}

export async function validateSessionToken(token: string) {
	const row = await repo.findSessionById(hashSessionToken(token));
	if (!row || row.expiresAt < new Date()) {
		return { person: null, actingAsPersonId: null, roleAssignments: [] };
	}
	return {
		person: { id: row.personId, fullName: row.fullName },
		actingAsPersonId: row.actingAsPersonId,
		roleAssignments: await repo.findRoleAssignmentsByPersonId(row.personId)
	};
}

export async function logout(token: string) {
	await repo.deleteSessionById(hashSessionToken(token));
}
