import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import { outboxMessages, registrations } from '$lib/server/db/schema';
import { resetDb } from '$lib/server/db/test/reset';
import { hashSessionToken } from '$lib/server/modules/auth/token';
import { markSpam, requestFix } from './decide';
import { asStaff, setup } from './test-support';

let s: Awaited<ReturnType<typeof setup>>;
beforeEach(async () => {
	await resetDb();
	s = await setup();
});
const get = async (id: string) =>
	(await db.select().from(registrations).where(eq(registrations.id, id)))[0];
const admin = <T>(fn: () => T) => asStaff('branch_admin', s.branch.id, fn);

describe('decisions', () => {
	it('needs fix stores the reason and sends the fix link', async () => {
		const r = await s.reg(['self'], { contactEmail: 'a@mail.test' });
		await admin(() => requestFix(r.id, 'Birth date is wrong'));
		const reg = await get(r.id);
		expect(reg).toMatchObject({ status: 'needs_fix', fixReason: 'Birth date is wrong' });
		const [msg] = await db.select().from(outboxMessages);
		const params = msg.params as Record<string, string>;
		expect(msg).toMatchObject({ channel: 'email', template: 'registration_needs_fix' });
		expect(params.reason).toBe('Birth date is wrong');
		const token = params.fixUrl.split('/register/fix/')[1];
		expect(reg.fixTokenHash).toBe(hashSessionToken(token));
		expect(JSON.stringify(reg)).not.toContain(token);
	});

	it('the WhatsApp needs-fix notice carries no reason', async () => {
		const r = await s.reg(['self'], { contactEmail: null, contactPhone: '+628123456789' });
		await admin(() => requestFix(r.id, 'Secret reason'));
		const [msg] = await db.select().from(outboxMessages);
		expect(msg.channel).toBe('whatsapp');
		expect(JSON.stringify(msg.params)).not.toContain('Secret reason');
	});

	it('spam sends nothing', async () => {
		const r = await s.reg(['self']);
		await admin(() => markSpam(r.id));
		expect((await get(r.id)).status).toBe('spam');
		expect(await db.select().from(outboxMessages)).toHaveLength(0);
	});

	it('a decided registration cannot be decided again', async () => {
		const r = await s.reg(['self']);
		await admin(() => markSpam(r.id));
		await expect(admin(() => requestFix(r.id, 'x'))).rejects.toThrow('error_already_decided');
		await expect(admin(() => markSpam(r.id))).rejects.toThrow('error_already_decided');
	});

	it('rejects an empty or oversized reason', async () => {
		const r = await s.reg(['self']);
		await expect(admin(() => requestFix(r.id, '   '))).rejects.toThrow('error_required');
		await expect(admin(() => requestFix(r.id, 'x'.repeat(1001)))).rejects.toThrow('error_too_long');
		expect((await get(r.id)).status).toBe('pending');
	});

	it('refuses roles that do not review', async () => {
		const r = await s.reg(['self']);
		await expect(asStaff('pastor', s.branch.id, () => markSpam(r.id))).rejects.toThrow('Forbidden');
	});
});
