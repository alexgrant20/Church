import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '$lib/server/db/client';
import { people } from '$lib/server/db/schema';
import { resetDb } from '$lib/server/db/test/reset';
import { makeBranch, makeCity, makeHousehold, makePerson } from '$lib/server/db/test/factories';
import { ForbiddenError } from '$lib/server/errors';
import { parsePage } from '$lib/server/pagination';
import { asStaff } from '$lib/server/modules/registration/test-support';
import { countMembers, listMembers } from './list-service';
import type { MemberFilters } from './filters';

const decode = (cursor: string) => parsePage(new URL(`http://x/?cursor=${cursor}`)).cursor;
const page = (f: Partial<MemberFilters> = {}, cursor: string | null = null, limit = 50) =>
	listMembers({ status: 'active', ...f, cursor: cursor ? decode(cursor) : null, limit });
const names = (r: { items: { fullName: string }[] }) => r.items.map((i) => i.fullName);

describe('member list', () => {
	beforeEach(resetDb);

	it("lists only my branch's living members, by name", async () => {
		const [a, b] = [await makeBranch(), await makeBranch()];
		await makePerson({ homeBranchId: a.id, fullName: 'Budi' });
		await makePerson({ homeBranchId: a.id, fullName: 'Andi' });
		await makePerson({ homeBranchId: a.id, fullName: 'Citra', deceasedOn: '2026-01-01' });
		await makePerson({ homeBranchId: b.id, fullName: 'Dewi' });
		expect(names(await asStaff('branch_admin', a.id, () => page()))).toEqual(['Andi', 'Budi']);
	});

	it('leaves out non-members and soft-deleted people', async () => {
		const a = await makeBranch();
		await makePerson({ homeBranchId: a.id, fullName: 'Kept' });
		await makePerson({ homeBranchId: a.id, isMember: false, memberCode: null, fullName: 'Guest' });
		await makePerson({ homeBranchId: a.id, fullName: 'Gone', deletedAt: new Date() });
		expect(names(await asStaff('pastor', a.id, () => page()))).toEqual(['Kept']);
	});

	it('the deceased tab shows only the deceased', async () => {
		const a = await makeBranch();
		await makePerson({ homeBranchId: a.id, fullName: 'Alive' });
		await makePerson({ homeBranchId: a.id, fullName: 'Late', deceasedOn: '2026-01-01' });
		const r = await asStaff('branch_admin', a.id, () => page({ status: 'deceased' }));
		expect(names(r)).toEqual(['Late']);
		expect(r.items[0].deceasedOn).toBe('2026-01-01');
	});

	it('finds by part of a nickname, a Chinese name, and a Member ID prefix', async () => {
		const a = await makeBranch();
		await makePerson({ homeBranchId: a.id, fullName: 'A', nickname: 'Bubu' });
		await makePerson({ homeBranchId: a.id, fullName: 'B', chineseName: '王美玲' });
		await makePerson({ homeBranchId: a.id, fullName: 'C', memberCode: 'JKT-2026-00042' });
		await asStaff('branch_admin', a.id, async () => {
			expect(names(await page({ q: 'ubu' }))).toEqual(['A']);
			expect(names(await page({ q: '王美' }))).toEqual(['B']);
			expect(names(await page({ q: 'jkt-2026' }))).toEqual(['C']);
			expect(names(await page({ q: '2026-00042' }))).toEqual([]);
		});
	});

	it('treats % and _ in a search as plain characters', async () => {
		const a = await makeBranch();
		await makePerson({ homeBranchId: a.id, fullName: 'Budi_100%' });
		await makePerson({ homeBranchId: a.id, fullName: 'Budi 1000' });
		await asStaff('branch_admin', a.id, async () => {
			expect(names(await page({ q: '_100%' }))).toEqual(['Budi_100%']);
			expect(names(await page({ q: '%' }))).toEqual(['Budi_100%']);
		});
	});

	it('filters by city', async () => {
		const a = await makeBranch();
		const city = await makeCity();
		await makePerson({ homeBranchId: a.id, fullName: 'Here', cityId: city.id });
		await makePerson({ homeBranchId: a.id, fullName: 'There' });
		const r = await asStaff('branch_admin', a.id, () => page({ cityId: city.id }));
		expect(names(r)).toEqual(['Here']);
		expect(r.items[0].cityName).toBe(city.name);
	});

	it('pages two people with the same name without skipping or repeating', async () => {
		const a = await makeBranch();
		const [city, household] = [await makeCity(), await makeHousehold()];
		await db.insert(people).values(
			Array.from({ length: 51 }, (_, i) => ({
				memberCode: `S-${i}`,
				fullName: 'Sari',
				sex: 'female' as const,
				birthDate: '1990-01-01',
				addressLine: 'Jl. A',
				homeBranchId: a.id,
				householdId: household.id,
				cityId: city.id
			}))
		);
		await asStaff('branch_admin', a.id, async () => {
			const first = await page({}, null, 50);
			expect(first.items).toHaveLength(50);
			const second = await page({}, first.nextCursor, 50);
			expect(second.items).toHaveLength(1);
			expect(second.nextCursor).toBeNull();
			const ids = new Set([...first.items, ...second.items].map((i) => i.id));
			expect(ids.size).toBe(51);
		});
	});

	it('a branch admin asking for another branch is forbidden', async () => {
		const [a, b] = [await makeBranch(), await makeBranch()];
		await expect(asStaff('branch_admin', a.id, () => page({ branchId: b.id }))).rejects.toThrow(
			ForbiddenError
		);
	});

	it('a superadmin filters by any branch', async () => {
		const [a, b] = [await makeBranch(), await makeBranch()];
		await makePerson({ homeBranchId: a.id, fullName: 'InA' });
		await makePerson({ homeBranchId: b.id, fullName: 'InB' });
		const r = await asStaff('superadmin', null, () => page({ branchId: b.id }));
		expect(names(r)).toEqual(['InB']);
		expect(r.items[0].branchName).toBe(b.name);
	});

	it('a superadmin with an unknown branch id gets an empty list', async () => {
		const r = await asStaff('superadmin', null, () =>
			page({ branchId: '01900000-0000-7000-8000-000000000000' })
		);
		expect(r.items).toEqual([]);
	});

	it('counts with the same filters', async () => {
		const a = await makeBranch();
		await makePerson({ homeBranchId: a.id, fullName: 'Budi' });
		await makePerson({ homeBranchId: a.id, fullName: 'Andi' });
		await asStaff('branch_admin', a.id, async () => {
			expect(await countMembers({ status: 'active' })).toBe(2);
			expect(await countMembers({ status: 'active', q: 'bud' })).toBe(1);
		});
	});

	it('a group admin is forbidden', async () => {
		await expect(asStaff('group_admin', null, () => page())).rejects.toThrow(ForbiddenError);
	});
});
