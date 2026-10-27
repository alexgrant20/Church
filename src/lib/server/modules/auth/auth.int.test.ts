import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '$lib/server/db/client';
import { auditLogs } from '$lib/server/db/schema';
import { resetDb } from '$lib/server/db/test/reset';
import { expectDbError } from '$lib/server/db/test/expect-db-error';
import { makeAccount, makePerson } from '$lib/server/db/test/factories';
import { findAccountByIdentifier } from './repository';
import { normalizeIdentifier } from './identifier';
import { login, validateSessionToken } from './service';

describe('login', () => {
	beforeEach(resetDb);

	it('finds an account by email in any letter case', async () => {
		const p = await makePerson();
		await makeAccount(p.id, { email: 'budi@mail.com' });
		expect((await findAccountByIdentifier(normalizeIdentifier('Budi@Mail.com')))?.personId).toBe(
			p.id
		);
	});
	it('gives the same error for an unknown user and an unactivated account', async () => {
		const p = await makePerson();
		await makeAccount(p.id, { email: 'sari@mail.com', passwordHash: null });
		const ip = { ip: '127.0.0.1' };
		await expect(login({ identifier: 'sari@mail.com', password: 'whatever1' }, ip)).rejects.toThrow(
			'Invalid credentials'
		);
		await expect(
			login({ identifier: 'nobody@mail.com', password: 'whatever1' }, ip)
		).rejects.toThrow('Invalid credentials');
	});
	it('rejects a suspended account', async () => {
		const p = await makePerson();
		await makeAccount(p.id, { email: 'a@mail.com', status: 'suspended' });
		await expect(
			login({ identifier: 'a@mail.com', password: 'correct-horse' }, { ip: '1' })
		).rejects.toThrow('Invalid credentials');
	});
	it('logs in, creates a session, and writes the audit row with the person as actor', async () => {
		const p = await makePerson();
		await makeAccount(p.id, { email: 'b@mail.com' });
		const { token } = await login(
			{ identifier: 'b@mail.com', password: 'correct-horse' },
			{ ip: '1' }
		);
		expect((await validateSessionToken(token)).person?.id).toBe(p.id);
		const [audit] = await db.select().from(auditLogs);
		expect(audit.actorPersonId).toBe(p.id);
		expect(audit.onBehalfOfPersonId).toBeNull();
	});
	it('rejects an account with neither email nor phone', async () => {
		const p = await makePerson();
		await expectDbError(makeAccount(p.id, { email: null, phone: null }), /check/);
	});
});
