import { describe, it, expect, beforeEach, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import { auditLogs, personRelationships } from '$lib/server/db/schema';
import { encryptNik, keyedHash } from '$lib/server/crypto';
import { resetDb } from '$lib/server/db/test/reset';
import {
	makeAccount,
	makeBranch,
	makeHousehold,
	makeMemberProfile,
	makePerson
} from '$lib/server/db/test/factories';
import { NotFoundError } from '$lib/server/errors';
import { asStaff } from '$lib/server/modules/registration/test-support';
import * as recordRepo from './record-repository';
import { getMember } from './record-service';

const nik = '3174012345670001';

async function familyOfBudi() {
	const [a, b] = [await makeBranch(), await makeBranch()];
	const home = await makeHousehold();
	const budi = await makePerson({
		homeBranchId: a.id,
		householdId: home.id,
		fullName: 'Budi',
		nikEncrypted: encryptNik(nik),
		nikHash: keyedHash(nik)
	});
	await makeMemberProfile(budi.id);
	await makeAccount(budi.id, { email: 'budi@mail.test' });
	const sari = await makePerson({ homeBranchId: b.id, householdId: home.id, fullName: 'Sari' });
	const andi = await makePerson({ homeBranchId: b.id, householdId: home.id, fullName: 'Andi' });
	const aunt = await makePerson({
		homeBranchId: a.id,
		householdId: home.id,
		fullName: 'Aunt',
		isMember: false,
		memberCode: null
	});
	const mother = await makePerson({ homeBranchId: a.id, fullName: 'Mother' });
	const son = await makePerson({ homeBranchId: b.id, fullName: 'Son' });
	const [x, y] = [budi.id, sari.id].sort();
	await db.insert(personRelationships).values([
		{ kind: 'spouse', personId: x, relatedPersonId: y },
		{ kind: 'parent', personId: budi.id, relatedPersonId: andi.id },
		{ kind: 'parent', personId: sari.id, relatedPersonId: andi.id },
		{ kind: 'parent', personId: mother.id, relatedPersonId: budi.id },
		{ kind: 'parent', personId: budi.id, relatedPersonId: son.id }
	]);
	return { a, b, budi, sari, andi, aunt, mother, son };
}

const asAdminOf = <T>(branchId: string, fn: () => T) => asStaff('branch_admin', branchId, fn);
const viewAudits = () =>
	db.select().from(auditLogs).where(eq(auditLogs.action, 'person.viewed_cross_branch'));

describe('member record', () => {
	beforeEach(resetDb);

	it('shows the person with NIK masked and profile fields', async () => {
		const f = await familyOfBudi();
		const r = await asAdminOf(f.a.id, () => getMember(f.budi.id));
		expect(r.access).toBe('own');
		expect(r.person.nikMasked).toBe('3174••••••••0001');
		expect(r.person).not.toHaveProperty('nikEncrypted');
		expect(r.profile).not.toBeNull();
		expect(r.login).toEqual({ email: 'budi@mail.test', phone: null, activated: true });
	});

	it('groups the household and the family outside it with relations', async () => {
		const f = await familyOfBudi();
		const { family } = await asAdminOf(f.a.id, () => getMember(f.budi.id));
		const rel = (list: typeof family.household) =>
			Object.fromEntries(list.map((p) => [p.fullName, p.relation]));
		expect(rel(family.household)).toEqual({
			Sari: 'spouse',
			Andi: 'child',
			Aunt: 'household'
		});
		expect(rel(family.outside)).toEqual({ Mother: 'parent', Son: 'child' });
	});

	it('labels a non-member relative with a null Member ID', async () => {
		const f = await familyOfBudi();
		const { family } = await asAdminOf(f.a.id, () => getMember(f.budi.id));
		expect(family.household.find((p) => p.fullName === 'Aunt')?.memberCode).toBeNull();
	});

	it('a relative outside scope and outside any shared household is listed but not linkable', async () => {
		const f = await familyOfBudi();
		const { family } = await asAdminOf(f.a.id, () => getMember(f.budi.id));
		const link = (name: string) =>
			[...family.household, ...family.outside].find((p) => p.fullName === name)?.linkable;
		expect(link('Son')).toBe(false);
		expect(link('Sari')).toBe(true);
		expect(link('Mother')).toBe(true);
	});

	it('opening a household member from another branch is read-only and audited once', async () => {
		const f = await familyOfBudi();
		const r = await asAdminOf(f.a.id, () => getMember(f.sari.id));
		expect(r.access).toBe('cross');
		const rows = await viewAudits();
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({ entityType: 'person', entityId: f.sari.id, branchId: f.b.id });
	});

	it('opening an own-branch person writes no audit row', async () => {
		const f = await familyOfBudi();
		await asAdminOf(f.a.id, () => getMember(f.budi.id));
		expect(await viewAudits()).toHaveLength(0);
	});

	it('a person outside scope and outside any shared household is not found', async () => {
		const f = await familyOfBudi();
		await expect(asAdminOf(f.a.id, () => getMember(f.son.id))).rejects.toThrow(NotFoundError);
	});

	it('a non-uuid id is not found', async () => {
		const f = await familyOfBudi();
		await expect(asAdminOf(f.a.id, () => getMember('nope'))).rejects.toThrow(NotFoundError);
	});

	it('leaves out an ended marriage', async () => {
		const f = await familyOfBudi();
		await db
			.update(personRelationships)
			.set({ endedOn: '2020-01-01' })
			.where(eq(personRelationships.kind, 'spouse'));
		const { family } = await asAdminOf(f.a.id, () => getMember(f.budi.id));
		expect(family.household.find((p) => p.fullName === 'Sari')?.relation).toBe('household');
	});

	it('uses a fixed number of queries for a family of 8', async () => {
		const f = await familyOfBudi();
		for (let i = 0; i < 3; i++) {
			const child = await makePerson({ homeBranchId: f.a.id, householdId: f.budi.householdId });
			await db
				.insert(personRelationships)
				.values({ kind: 'parent', personId: f.budi.id, relatedPersonId: child.id });
		}
		const spies = [
			vi.spyOn(recordRepo, 'findPersonDetail'),
			vi.spyOn(recordRepo, 'householdPeople'),
			vi.spyOn(recordRepo, 'relationshipsOf'),
			vi.spyOn(recordRepo, 'householdBranchIds')
		];
		await asAdminOf(f.a.id, () => getMember(f.budi.id));
		expect(spies.map((s) => s.mock.calls.length)).toEqual([1, 1, 1, 1]);
	});
});
