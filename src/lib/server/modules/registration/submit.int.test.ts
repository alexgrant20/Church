import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import {
	auditLogs,
	outboxMessages,
	people,
	registrationConsents,
	registrationLinks,
	registrations
} from '$lib/server/db/schema';
import { resetDb } from '$lib/server/db/test/reset';
import {
	makeAccount,
	makeBranch,
	makeCity,
	makePerson,
	makeRegistrationLink
} from '$lib/server/db/test/factories';
import { keyedHash } from '$lib/server/crypto';
import { NotFoundError, ValidationError } from '$lib/server/errors';
import { generateSessionToken, hashSessionToken } from '$lib/server/modules/auth/token';
import { submitRegistration } from './submit';

const NIK = '3174012345670001';
let cityId: string;
let token: string;
let linkId: string;

const person = (relation: string, extra: Record<string, unknown> = {}) => ({
	relation,
	fullName: 'Budi Santoso',
	nickname: 'Budi',
	sex: 'male',
	birthDate: '1990-05-01',
	birthCityId: cityId,
	address: { line: 'Jl. Mawar 1', cityId },
	occupation: 'employee',
	education: 'bachelor',
	previousChurch: null,
	baptism: { baptized: false },
	sidi: { sidi: false },
	...extra
});
const form = (self: Record<string, unknown> = {}) => ({
	people: [person('self', { email: 'new@mail.test', ...self }), person('child')]
});
const meta = (deviceId = 'dev-1', ip = '10.0.0.1') => ({ ip, deviceId, locale: 'id' as const });
const submit = (input: unknown = form(), m = meta()) => submitRegistration(token, input, m);

describe('submitRegistration', () => {
	beforeEach(async () => {
		await resetDb();
		cityId = (await makeCity()).id;
		token = generateSessionToken();
		const branch = await makeBranch();
		linkId = (
			await makeRegistrationLink({ branchId: branch.id, tokenHash: hashSessionToken(token) })
		).id;
	});

	it('stores a pending registration and creates no people', async () => {
		const peopleBefore = await db.select().from(people);
		await submit();
		const rows = await db.select().from(registrations);
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			status: 'pending',
			contactEmail: 'new@mail.test',
			contactPhone: null,
			registrationLinkId: linkId,
			locale: 'id'
		});
		expect(await db.select().from(people)).toHaveLength(peopleBefore.length);
		const [audit] = await db.select().from(auditLogs);
		expect(audit).toMatchObject({
			action: 'registration.submitted',
			diff: { peopleCount: { after: 2 } }
		});
		expect(await db.select().from(registrationConsents)).toHaveLength(0);
	});

	it('the stored payload holds no clear NIK', async () => {
		await submit(form({ nik: NIK }));
		const [row] = await db.select().from(registrations);
		expect(JSON.stringify(row.payload)).not.toContain(NIK);
		const first = (row.payload as { people: Record<string, unknown>[] }).people[0];
		expect(first.nik).toBeUndefined();
		expect(first.nikHash).toBe(keyedHash(NIK));
		expect(typeof first.nikEncrypted).toBe('string');
		const [audit] = await db.select().from(auditLogs);
		expect(JSON.stringify(audit)).not.toContain(NIK);
	});

	it('a matching email creates a waiting consent and a consent message, and resolves like a clean one', async () => {
		const member = await makePerson({ fullName: 'Old Member' });
		await makeAccount(member.id, { email: 'Known@Mail.test', phone: null });
		const clean = await submit();
		const matched = await submit(form({ email: 'known@MAIL.test' }));
		expect(matched).toEqual(clean);
		const consents = await db.select().from(registrationConsents);
		expect(consents).toHaveLength(1);
		expect(consents[0]).toMatchObject({
			personIndex: 0,
			matchedPersonId: member.id,
			decision: 'waiting'
		});
		expect(consents[0].tokenHash).toMatch(/^[0-9a-f]{64}$/);
		const [msg] = await db.select().from(outboxMessages);
		expect(msg).toMatchObject({ template: 'consent_request', recipient: 'known@mail.test' });
		const params = msg.params as { registrantName: string; consentUrl: string };
		expect(params.registrantName).toBe('Budi Santoso');
		expect(hashSessionToken(params.consentUrl.split('/consent/')[1])).toBe(consents[0].tokenHash);
	});

	it('matches by NIK hash and by phone, live members only', async () => {
		const byNik = await makePerson({ nikHash: keyedHash(NIK) });
		const gone = await makePerson({ deletedAt: new Date() });
		await makeAccount(gone.id, { email: 'gone@mail.test' });
		const byPhone = await makePerson();
		await makeAccount(byPhone.id, { email: null, phone: '+6281234567890' });
		await submit({
			people: [
				person('self', { email: 'gone@mail.test', nik: NIK }),
				person('spouse', { phone: '0812 3456 7890' })
			]
		});
		const consents = await db
			.select()
			.from(registrationConsents)
			.orderBy(registrationConsents.personIndex);
		expect(consents.map((c) => [c.personIndex, c.matchedPersonId])).toEqual([
			[0, byNik.id],
			[1, byPhone.id]
		]);
	});

	it('a matched member without an activated account gets a consent row with no token and no message', async () => {
		const member = await makePerson();
		await makeAccount(member.id, { email: 'inactive@mail.test', activatedAt: null });
		const orphan = await makePerson({ nikHash: keyedHash(NIK) });
		await submit({
			people: [person('self', { email: 'inactive@mail.test' }), person('child', { nik: NIK })]
		});
		const consents = await db
			.select()
			.from(registrationConsents)
			.orderBy(registrationConsents.personIndex);
		expect(consents.map((c) => [c.matchedPersonId, c.tokenHash])).toEqual([
			[member.id, null],
			[orphan.id, null]
		]);
		expect(await db.select().from(outboxMessages)).toHaveLength(0);
	});

	it('the 6th submission from one device within an hour is refused', async () => {
		for (let i = 0; i < 5; i++) await submit();
		await expect(submit()).rejects.toThrow(new ValidationError('error_too_many_submissions'));
		expect(await db.select().from(registrations)).toHaveLength(5);
	});

	it('5 devices on one IP can each submit 5', async () => {
		for (let d = 0; d < 5; d++) {
			for (let i = 0; i < 5; i++) await submit(form(), meta(`dev-${d}`));
		}
		expect(await db.select().from(registrations)).toHaveLength(25);
	});

	it('the 51st submission from one IP within an hour is refused', async () => {
		for (let i = 0; i < 50; i++) await submit(form(), meta(`dev-${Math.floor(i / 5)}`));
		await expect(submit(form(), meta('dev-new'))).rejects.toThrow('error_too_many_submissions');
	});

	it('counts malformed submissions too', async () => {
		for (let i = 0; i < 5; i++) {
			await expect(submit({ people: [] })).rejects.toThrow(ValidationError);
		}
		await expect(submit()).rejects.toThrow('error_too_many_submissions');
	});

	it('a revoked or rotated link is refused', async () => {
		await expect(submitRegistration('nope', form(), meta())).rejects.toThrow(NotFoundError);
		await db
			.update(registrationLinks)
			.set({ revokedAt: new Date() })
			.where(eq(registrationLinks.id, linkId));
		await expect(submit()).rejects.toThrow(NotFoundError);
	});
});
