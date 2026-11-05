import { describe, it, expect, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import { accounts, sessions } from '$lib/server/db/schema';
import { resetDb } from '$lib/server/db/test/reset';
import { makeAccount, makePerson } from '$lib/server/db/test/factories';
import { reactivateAccount, suspendAccount } from './account-status';

const statusOf = async (personId: string) =>
	(await db.select().from(accounts).where(eq(accounts.personId, personId)))[0].status;
const sessionCount = async (personId: string) =>
	(await db.select().from(sessions).where(eq(sessions.personId, personId))).length;

async function signedIn() {
	const p = await makePerson();
	await makeAccount(p.id);
	await db.insert(sessions).values({
		id: 'a'.repeat(64),
		personId: p.id,
		expiresAt: new Date(Date.now() + 3_600_000)
	});
	return p;
}

describe('account status', () => {
	beforeEach(resetDb);

	it('suspends the account and ends its sessions', async () => {
		const p = await signedIn();
		const r = await db.transaction((tx) => suspendAccount(tx, p.id));
		expect(r).toEqual({ before: 'active', after: 'suspended' });
		expect(await statusOf(p.id)).toBe('suspended');
		expect(await sessionCount(p.id)).toBe(0);
	});

	it('returns null for a person with no account', async () => {
		const p = await makePerson();
		expect(await db.transaction((tx) => suspendAccount(tx, p.id))).toBeNull();
	});

	it('reactivates a suspended account', async () => {
		const p = await signedIn();
		await db.transaction((tx) => suspendAccount(tx, p.id));
		const r = await db.transaction((tx) => reactivateAccount(tx, p.id));
		expect(r).toEqual({ before: 'suspended', after: 'active' });
		expect(await statusOf(p.id)).toBe('active');
	});

	it('leaves an active account alone on reactivate', async () => {
		const p = await signedIn();
		expect(await db.transaction((tx) => reactivateAccount(tx, p.id))).toBeNull();
	});
});
