import { beforeEach, describe, expect, it } from 'vitest';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import { outboxMessages, people, registrationConsents, registrations } from '$lib/server/db/schema';
import { resetDb } from '$lib/server/db/test/reset';
import { makeAccount, makePerson } from '$lib/server/db/test/factories';
import { runWithContext } from '$lib/server/context';
import { NotFoundError } from '$lib/server/errors';
import { generateSessionToken, hashSessionToken } from '$lib/server/modules/auth/token';
import { approveRegistration } from './approve';
import { decideConsent, loadConsent } from './consent';
import { loadFix, resubmitFix } from './fix';
import { asStaff, setup } from './test-support';

let s: Awaited<ReturnType<typeof setup>>;
const meta = { ip: '10.0.0.9', deviceId: 'dev-fix', locale: 'id' as const };
const asPerson = <T>(personId: string | null, fn: () => T) =>
	runWithContext({ personId, actingAsPersonId: null, ip: '127.0.0.1', roleAssignments: [] }, fn);

const person = (relation: string, extra: Record<string, unknown> = {}) => ({
	relation,
	fullName: 'Budi Santoso',
	nickname: 'Budi',
	sex: 'male',
	birthDate: '1990-05-01',
	birthCityId: s.city.id,
	address: { line: 'Jl. Mawar 1', postalCode: '12345', cityId: s.city.id },
	occupation: 'employee',
	education: 'bachelor',
	previousChurch: null,
	baptism: { baptized: false },
	sidi: { sidi: false },
	...extra
});
const form = (child: Record<string, unknown> = {}) => ({
	people: [person('self', { email: 'fixed@mail.test' }), person('child', child)]
});

async function needsFix() {
	const token = generateSessionToken();
	const reg = await s.reg(['self', 'child'], {
		status: 'needs_fix',
		fixReason: 'Fix the name',
		fixTokenHash: hashSessionToken(token)
	});
	return { token, reg };
}

async function member() {
	const m = await makePerson({ homeBranchId: s.branch.id });
	const account = await makeAccount(m.id);
	return { m, email: account.email! };
}

async function waitingConsent(registrationId: string, matchedPersonId: string, personIndex = 1) {
	const token = generateSessionToken();
	await db.insert(registrationConsents).values({
		registrationId,
		personIndex,
		matchedPersonId,
		tokenHash: hashSessionToken(token)
	});
	return token;
}

const liveConsents = (registrationId: string) =>
	db
		.select()
		.from(registrationConsents)
		.where(
			and(
				eq(registrationConsents.registrationId, registrationId),
				isNull(registrationConsents.deletedAt)
			)
		);

beforeEach(async () => {
	await resetDb();
	s = await setup();
});

describe('fix link', () => {
	it('loads the reason and the data', async () => {
		const { token } = await needsFix();
		const fix = await loadFix(token);
		expect(fix.reason).toBe('Fix the name');
		expect(fix.input.people).toHaveLength(2);
		expect(fix.input.people[0]).not.toHaveProperty('nik');
		expect(fix.input.people[0]).not.toHaveProperty('nikEncrypted');
		expect(fix.nikMasked[0]).toMatch(/^\d{4}•{8}\d{4}$/);
		expect(fix.cityNames).toEqual({ [s.city.id]: s.city.name });
	});

	it('resubmitting returns it to pending and kills the link', async () => {
		const { token, reg } = await needsFix();
		const before = (reg.payload as { people: { nikHash: string }[] }).people[0].nikHash;
		await resubmitFix(token, form(), meta);
		const [row] = await db.select().from(registrations).where(eq(registrations.id, reg.id));
		expect(row).toMatchObject({ status: 'pending', fixTokenHash: null, fixReason: null });
		expect(row.contactEmail).toBe('fixed@mail.test');
		// The NIK was not retyped, so the stored one is kept.
		expect((row.payload as { people: { nikHash: string }[] }).people[0].nikHash).toBe(before);
		await expect(loadFix(token)).rejects.toBeInstanceOf(NotFoundError);
	});

	it('a used fix link is not found', async () => {
		const { token } = await needsFix();
		await resubmitFix(token, form(), meta);
		await expect(resubmitFix(token, form(), meta)).rejects.toBeInstanceOf(NotFoundError);
		await expect(resubmitFix(generateSessionToken(), form(), meta)).rejects.toBeInstanceOf(
			NotFoundError
		);
	});

	it('keeps a consent whose match is unchanged', async () => {
		const { token, reg } = await needsFix();
		const { m, email } = await member();
		await db.insert(registrationConsents).values({
			registrationId: reg.id,
			personIndex: 1,
			matchedPersonId: m.id,
			decision: 'given'
		});
		await resubmitFix(token, form({ email }), meta);
		const rows = await liveConsents(reg.id);
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({ matchedPersonId: m.id, decision: 'given' });
	});

	it('removes a consent whose match is gone and asks a new match', async () => {
		const { token, reg } = await needsFix();
		const { m } = await member();
		const other = await member();
		await waitingConsent(reg.id, m.id);
		await resubmitFix(token, form({ email: other.email }), meta);
		const rows = await liveConsents(reg.id);
		expect(rows).toHaveLength(1);
		expect(rows[0].matchedPersonId).toBe(other.m.id);
		const all = await db.select().from(registrationConsents);
		expect(all.find((c) => c.matchedPersonId === m.id)?.deletedAt).not.toBeNull();
		const msgs = await db.select().from(outboxMessages);
		expect(msgs.map((x) => x.template)).toEqual(['consent_request']);
	});
});

describe('consent link', () => {
	it('only the matched member can open the consent link', async () => {
		const reg = await s.reg(['self', 'child']);
		const { m } = await member();
		const stranger = await member();
		const token = await waitingConsent(reg.id, m.id);
		await expect(asPerson(m.id, () => loadConsent(token))).resolves.toEqual({
			registrantName: 'Person 1',
			branchName: s.branch.name
		});
		await expect(asPerson(stranger.m.id, () => loadConsent(token))).rejects.toBeInstanceOf(
			NotFoundError
		);
		await expect(asPerson(null, () => loadConsent(token))).rejects.toBeInstanceOf(NotFoundError);
		await expect(
			asPerson(stranger.m.id, () => decideConsent(token, 'given'))
		).rejects.toBeInstanceOf(NotFoundError);
	});

	it('declining marks the person declined and approval then skips them', async () => {
		const reg = await s.reg(['self', 'child']);
		const { m } = await member();
		const token = await waitingConsent(reg.id, m.id);
		await asPerson(m.id, () => decideConsent(token, 'declined'));
		expect((await liveConsents(reg.id))[0].decision).toBe('declined');
		const before = (await db.select().from(people)).length;
		await asStaff('branch_admin', s.branch.id, () => approveRegistration(reg.id));
		expect((await db.select().from(people)).length).toBe(before + 1);
		const [notice] = await db
			.select()
			.from(outboxMessages)
			.where(eq(outboxMessages.template, 'registration_approved'));
		expect((notice.params as Record<string, string>).someoneNotAdded).toBe('yes');
	});

	it('a consent cannot be decided twice', async () => {
		const reg = await s.reg(['self', 'child']);
		const { m } = await member();
		const token = await waitingConsent(reg.id, m.id);
		await asPerson(m.id, () => decideConsent(token, 'given'));
		await expect(asPerson(m.id, () => decideConsent(token, 'declined'))).rejects.toBeInstanceOf(
			NotFoundError
		);
		await expect(asPerson(m.id, () => loadConsent(token))).rejects.toBeInstanceOf(NotFoundError);
	});

	it('refuses a consent on a registration that is no longer pending', async () => {
		const reg = await s.reg(['self', 'child'], { status: 'spam' });
		const { m } = await member();
		const token = await waitingConsent(reg.id, m.id);
		await expect(asPerson(m.id, () => decideConsent(token, 'given'))).rejects.toThrow(
			'error_already_decided'
		);
	});
});
