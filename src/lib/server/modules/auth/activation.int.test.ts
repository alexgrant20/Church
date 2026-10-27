import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db } from '$lib/server/db/client';
import { auditLogs, accounts, otpCodes } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { resetDb } from '$lib/server/db/test/reset';
import { makeAccount, makePerson } from '$lib/server/db/test/factories';
import type { OutgoingMessage } from '$lib/server/modules/messaging/sender';
import * as sender from '$lib/server/modules/messaging/sender';
import { login } from './service';
import { startActivation, completeActivation } from './activation';

let sent: OutgoingMessage[];

describe('account activation', () => {
	beforeEach(async () => {
		await resetDb();
		sent = [];
		vi.spyOn(sender, 'sendMessage').mockImplementation(async (m) => void sent.push(m));
	});
	afterEach(() => vi.restoreAllMocks());

	async function unactivated(email = 'sari@mail.com') {
		const p = await makePerson();
		await makeAccount(p.id, { email, passwordHash: null, activatedAt: null });
		return p;
	}

	it('activates an unactivated account', async () => {
		await unactivated();
		const { challengeToken } = await startActivation({ identifier: 'sari@mail.com' });
		await completeActivation({
			challengeToken,
			code: sent[0].params.code,
			password: 'new-password-1'
		});
		const res = await login(
			{ identifier: 'sari@mail.com', password: 'new-password-1' },
			{ ip: '' }
		);
		expect(res.challengeToken).toEqual(expect.any(String));
	});

	it('answers the same and sends nothing for ineligible identifiers', async () => {
		const active = await makePerson();
		await makeAccount(active.id, { email: 'active@mail.com' });
		const susp = await makePerson();
		await makeAccount(susp.id, {
			email: 'susp@mail.com',
			passwordHash: null,
			activatedAt: null,
			status: 'suspended'
		});
		for (const identifier of ['nobody@mail.com', 'active@mail.com', 'susp@mail.com']) {
			expect(await startActivation({ identifier })).toEqual({ challengeToken: expect.any(String) });
		}
		expect(sent).toHaveLength(0);
		expect(await db.select().from(otpCodes)).toHaveLength(0);
	});

	it('cannot complete with a token that was never backed by a code', async () => {
		const { challengeToken } = await startActivation({ identifier: 'nobody@mail.com' });
		await expect(
			completeActivation({ challengeToken, code: '123456', password: 'new-password-1' })
		).rejects.toThrow('error_invalid_code');
	});

	it('refuses when the account was suspended after the code was sent', async () => {
		const p = await unactivated();
		const { challengeToken } = await startActivation({ identifier: 'sari@mail.com' });
		await db.update(accounts).set({ status: 'suspended' }).where(eq(accounts.personId, p.id));
		await expect(
			completeActivation({
				challengeToken,
				code: sent[0].params.code,
				password: 'new-password-1'
			})
		).rejects.toThrow('error_invalid_code');
	});

	it('writes one audit row without the password hash', async () => {
		const p = await unactivated();
		const { challengeToken } = await startActivation({ identifier: 'sari@mail.com' });
		await completeActivation({
			challengeToken,
			code: sent[0].params.code,
			password: 'new-password-1'
		});
		const audits = await db.select().from(auditLogs);
		expect(audits).toHaveLength(1);
		expect(audits[0]).toMatchObject({
			action: 'account.activated',
			entityId: p.id,
			diff: { activated: { before: false, after: true } }
		});
		const [account] = await db.select().from(accounts);
		expect(JSON.stringify(audits[0])).not.toContain(account.passwordHash!);
	});
});
