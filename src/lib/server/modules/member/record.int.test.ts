import { describe, it, expect, beforeEach, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import { auditLogs, personRelationships, systemSettings } from '$lib/server/db/schema';
import { resetDb } from '$lib/server/db/test/reset';
import { makePerson } from '$lib/server/db/test/factories';
import { NotFoundError } from '$lib/server/errors';
import { asStaff } from '$lib/server/modules/registration/test-support';
import * as recordRepo from './record-repository';
import { getMember } from './record-service';
import { familyOfBudi } from './test-family';
import { recordMovedOut, undoMovedOut } from './moved-out';

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

	it('says whether the family tree is switched on', async () => {
		const f = await familyOfBudi();
		expect((await asAdminOf(f.a.id, () => getMember(f.budi.id))).treeEnabled).toBe(true);
		await db.insert(systemSettings).values({ key: 'membership.family_tree_enabled', value: false });
		expect((await asAdminOf(f.a.id, () => getMember(f.budi.id))).treeEnabled).toBe(false);
	});

	it('says whether staff may change the person and move them back', async () => {
		const f = await familyOfBudi();
		const own = await asAdminOf(f.a.id, () => getMember(f.budi.id));
		expect(own.changes).toEqual({
			canChange: true,
			canMarry: false,
			canMoveOut: true,
			canUndoMoveOut: false
		});
		const pastor = await asStaff('pastor', f.a.id, () => getMember(f.budi.id));
		expect(pastor.changes.canChange).toBe(false);
		const cross = await asAdminOf(f.b.id, () => getMember(f.budi.id));
		expect(cross.changes.canChange).toBe(false);
	});

	it('offers move back only while the latest move stands', async () => {
		const f = await familyOfBudi();
		const city = (await recordRepo.findPersonDetail(f.budi.id))!.person.cityId;
		const address = { line: 'Jl. Baru 3', postalCode: '10330', cityId: city };
		await asAdminOf(f.a.id, () => recordMovedOut(f.budi.id, { address }));
		expect((await asAdminOf(f.a.id, () => getMember(f.budi.id))).changes.canUndoMoveOut).toBe(true);
		await asAdminOf(f.a.id, () => undoMovedOut(f.budi.id));
		expect((await asAdminOf(f.a.id, () => getMember(f.budi.id))).changes.canUndoMoveOut).toBe(
			false
		);
	});

	it('offers move out only to a living adult who does not live alone', async () => {
		const f = await familyOfBudi();
		const changes = async (id: string) =>
			(await asAdminOf(f.a.id, () => getMember(id))).changes.canMoveOut;
		expect(await changes(f.budi.id)).toBe(true);
		const kid = await makePerson({
			homeBranchId: f.a.id,
			householdId: f.budi.householdId,
			birthDate: `${new Date().getUTCFullYear() - 10}-01-01`
		});
		expect(await changes(kid.id)).toBe(false);
		expect(await changes(f.mother.id)).toBe(false);
	});

	it('offers move out and move back together after a move', async () => {
		const f = await familyOfBudi();
		const city = (await recordRepo.findPersonDetail(f.budi.id))!.person.cityId;
		await makePerson({ homeBranchId: f.a.id, householdId: f.budi.householdId });
		const address = { line: 'Jl. Baru 3', postalCode: '10330', cityId: city };
		await asAdminOf(f.a.id, () => recordMovedOut(f.budi.id, { address }));
		const { changes } = await asAdminOf(f.a.id, () => getMember(f.budi.id));
		expect(changes.canUndoMoveOut).toBe(true);
		expect(changes.canMoveOut).toBe(false);
	});

	it('offers got married only to an unmarried adult', async () => {
		const f = await familyOfBudi();
		const canMarry = async (role: 'branch_admin' | 'pastor', id: string) =>
			(await asStaff(role, f.a.id, () => getMember(id))).changes.canMarry;
		expect(await canMarry('branch_admin', f.mother.id)).toBe(true);
		expect(await canMarry('branch_admin', f.budi.id)).toBe(false);
		expect(await canMarry('pastor', f.mother.id)).toBe(false);
	});
});
