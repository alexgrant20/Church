import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db } from '$lib/server/db/client';
import { auditLogs, accounts, sessions } from '$lib/server/db/schema';
import { resetDb } from '$lib/server/db/test/reset';
import { expectDbError } from '$lib/server/db/test/expect-db-error';
import { makeAccount, makePerson } from '$lib/server/db/test/factories';
import { findAccountByIdentifier } from './repository';
import { normalizeIdentifier } from './identifier';
import { DeliveryError, type OutgoingMessage } from '$lib/server/modules/messaging/sender';
import * as sender from '$lib/server/modules/messaging/sender';
import { login, verifyLogin, validateSessionToken } from './service';

const ip = { ip: '127.0.0.1' };
let sent: OutgoingMessage[];

describe('login', () => {
	beforeEach(async () => {
		await resetDb();
		sent = [];
		vi.spyOn(sender, 'sendMessage').mockImplementation(async (m) => void sent.push(m));
	});
	afterEach(() => vi.restoreAllMocks());

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
		await expect(login({ identifier: 'sari@mail.com', password: 'whatever1' }, ip)).rejects.toThrow(
			'error_invalid_credentials'
		);
		await expect(
			login({ identifier: 'nobody@mail.com', password: 'whatever1' }, ip)
		).rejects.toThrow('error_invalid_credentials');
	});
	it('rejects a suspended account', async () => {
		const p = await makePerson();
		await makeAccount(p.id, { email: 'a@mail.com', status: 'suspended' });
		await expect(
			login({ identifier: 'a@mail.com', password: 'correct-horse' }, ip)
		).rejects.toThrow('error_invalid_credentials');
	});
	it('login sends a code and only the code opens a session', async () => {
		const p = await makePerson();
		await makeAccount(p.id, { email: 'b@mail.com' });
		const { challengeToken } = await login(
			{ identifier: 'b@mail.com', password: 'correct-horse' },
			ip
		);
		expect(await db.select().from(sessions)).toHaveLength(0);
		const code = sent[0].params.code;
		expect(sent[0]).toMatchObject({ channel: 'email', to: 'b@mail.com' });

		const { token } = await verifyLogin({ challengeToken, code }, ip);
		expect((await validateSessionToken(token)).person?.id).toBe(p.id);
		const [account] = await db.select().from(accounts);
		expect(account.lastLoginAt).not.toBeNull();
		const audits = await db.select().from(auditLogs);
		expect(audits).toHaveLength(1);
		expect(audits[0]).toMatchObject({ action: 'auth.login', actorPersonId: p.id });
		expect(audits[0].onBehalfOfPersonId).toBeNull();
		expect(JSON.stringify(audits[0])).not.toContain(code);
	});
	it('unknown identifier gets the same error and locks like a real one', async () => {
		const p = await makePerson();
		await makeAccount(p.id, { email: 'real@mail.com' });
		for (const identifier of ['ghost@mail.com', 'real@mail.com']) {
			for (let i = 0; i < 5; i++)
				await expect(login({ identifier, password: 'wrong-pass1' }, ip)).rejects.toThrow(
					'error_invalid_credentials'
				);
			await expect(login({ identifier, password: 'wrong-pass1' }, ip)).rejects.toThrow(
				'error_try_again_later'
			);
		}
	});
	it('falls back to email when WhatsApp fails', async () => {
		const p = await makePerson();
		await makeAccount(p.id, { email: 'c@mail.com', phone: '+6281234567890' });
		vi.spyOn(sender, 'sendMessage').mockImplementation(async (m) => {
			if (m.channel === 'whatsapp') throw new DeliveryError('down');
			sent.push(m);
		});
		await login({ identifier: 'c@mail.com', password: 'correct-horse' }, ip);
		expect(sent.map((m) => m.channel)).toEqual(['email']);
	});
	it('no working channel says code not sent', async () => {
		const p = await makePerson();
		await makeAccount(p.id, { email: null, phone: '+6281234567891' });
		vi.spyOn(sender, 'sendMessage').mockRejectedValue(new DeliveryError('down'));
		await expect(
			login({ identifier: '+6281234567891', password: 'correct-horse' }, ip)
		).rejects.toThrow('error_code_not_sent');
	});
	it('rejects an account with neither email nor phone', async () => {
		const p = await makePerson();
		await expectDbError(makeAccount(p.id, { email: null, phone: null }), /check/);
	});
});
