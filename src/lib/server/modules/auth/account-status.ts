import type { Transaction } from '$lib/server/db/client';
import * as repo from './repository';

// Runs inside the caller's transaction, so the account change commits with the life change.
export async function suspendAccount(tx: Transaction, personId: string) {
	const before = await repo.findAccountStatus(tx, personId);
	if (!before) return null;
	await repo.updateAccountStatus(tx, personId, 'suspended');
	// Always, so a session that outlived an earlier suspension cannot survive this one.
	await repo.deleteSessionsByPersonId(tx, personId);
	return { before, after: 'suspended' as const };
}

export async function reactivateAccount(tx: Transaction, personId: string) {
	const before = await repo.findAccountStatus(tx, personId);
	if (before !== 'suspended') return null;
	await repo.updateAccountStatus(tx, personId, 'active');
	return { before, after: 'active' as const };
}
