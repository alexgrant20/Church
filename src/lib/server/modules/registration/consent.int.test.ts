import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '$lib/server/db/client';
import { outboxMessages, registrationConsents } from '$lib/server/db/schema';
import { resetDb } from '$lib/server/db/test/reset';
import { makeAccount, makePerson } from '$lib/server/db/test/factories';
import { runWithContext } from '$lib/server/context';
import { hashSessionToken } from '$lib/server/modules/auth/token';
import { approveRegistration } from './approve';
import { recordInPersonConsent, sendConsentRequest } from './decide';
import { asStaff, setup } from './test-support';

let s: Awaited<ReturnType<typeof setup>>;
const admin = <T>(fn: () => T) => asStaff('branch_admin', s.branch.id, fn);
const same = { fullName: 'Budi Santoso', birthDate: '1990-05-01' };

beforeEach(async () => {
	await resetDb();
	s = await setup();
});

const registration = () => s.reg(['self', 'child'], {}, [{}, same]);
const member = (activated: boolean) =>
	makePerson({ homeBranchId: s.branch.id, ...same }).then(async (p) => {
		await makeAccount(p.id, activated ? {} : { activatedAt: null });
		return p;
	});
const consents = () => db.select().from(registrationConsents);

describe('sendConsentRequest', () => {
	it('gives an activated member a token and a message', async () => {
		const r = await registration();
		const m = await member(true);
		await admin(() => sendConsentRequest(r.id, 1, m.id));
		const [row] = await consents();
		expect(row).toMatchObject({ matchedPersonId: m.id, decision: 'waiting' });
		const [msg] = await db.select().from(outboxMessages);
		expect(msg.template).toBe('consent_request');
		const url = (msg.params as Record<string, string>).consentUrl;
		expect(row.tokenHash).toBe(hashSessionToken(url.split('/consent/')[1]));
	});

	it('gives a non-activated member a token-less row and no message', async () => {
		const r = await registration();
		const m = await member(false);
		await admin(() => sendConsentRequest(r.id, 1, m.id));
		expect((await consents())[0].tokenHash).toBeNull();
		expect(await db.select().from(outboxMessages)).toHaveLength(0);
	});

	it('refuses a second request for the same person', async () => {
		const r = await registration();
		const m = await member(true);
		await admin(() => sendConsentRequest(r.id, 1, m.id));
		await expect(admin(() => sendConsentRequest(r.id, 1, m.id))).rejects.toThrow(
			'error_consent_exists'
		);
	});

	it('hides the registration from another branch', async () => {
		const r = await registration();
		const m = await member(true);
		const other = await makePerson();
		await expect(
			asStaff('branch_admin', other.homeBranchId, () => sendConsentRequest(r.id, 1, m.id))
		).rejects.toThrow('not found');
	});

	it('refuses a member who is not a name-and-birth-date match', async () => {
		const r = await registration();
		const stranger = await makePerson({ homeBranchId: s.branch.id });
		await expect(admin(() => sendConsentRequest(r.id, 1, stranger.id))).rejects.toThrow(
			'not found'
		);
	});

	it('refuses once the registration is decided', async () => {
		const r = await s.reg(['self', 'child'], {}, [{}, same]);
		const m = await member(true);
		await admin(() => approveRegistration(r.id));
		await expect(admin(() => sendConsentRequest(r.id, 1, m.id))).rejects.toThrow(
			'error_already_decided'
		);
	});
});

describe('recordInPersonConsent', () => {
	it('sets given and records the acting staff person', async () => {
		const r = await registration();
		const m = await member(false);
		await admin(() => sendConsentRequest(r.id, 1, m.id));
		const staff = await makePerson({ homeBranchId: s.branch.id });
		await runWithContext(
			{
				personId: staff.id,
				actingAsPersonId: null,
				ip: '127.0.0.1',
				roleAssignments: [{ role: 'branch_admin', branchId: s.branch.id, groupId: null }]
			},
			() => recordInPersonConsent(r.id, 1)
		);
		const [row] = await consents();
		expect(row).toMatchObject({ decision: 'given', recordedByPersonId: staff.id });
	});

	it('hides the registration from another branch', async () => {
		const r = await registration();
		const other = await makePerson();
		await expect(
			asStaff('branch_admin', other.homeBranchId, () => recordInPersonConsent(r.id, 1))
		).rejects.toThrow('not found');
	});

	it('refuses once the registration is decided', async () => {
		const r = await registration();
		const m = await member(false);
		await admin(() => sendConsentRequest(r.id, 1, m.id));
		await admin(() => recordInPersonConsent(r.id, 1));
		await admin(() => approveRegistration(r.id));
		await expect(admin(() => recordInPersonConsent(r.id, 1))).rejects.toThrow(
			'error_already_decided'
		);
	});
});
