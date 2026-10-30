import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import { auditLogs, people } from '$lib/server/db/schema';
import { resetDb } from '$lib/server/db/test/reset';
import {
	makeAccount,
	makeBranch,
	makeCity,
	makeHousehold,
	makeMemberProfile,
	makePerson
} from '$lib/server/db/test/factories';
import { ForbiddenError, ValidationError } from '$lib/server/errors';
import { asStaff } from '$lib/server/modules/registration/test-support';
import { exportMembers } from './export-service';

const active = { status: 'active' as const };

describe('member export', () => {
	beforeEach(resetDb);
	afterEach(() => vi.useRealTimers());

	it('exports exactly the filtered members', async () => {
		const a = await makeBranch();
		const budi = await makePerson({ homeBranchId: a.id, fullName: 'Budi', nickname: 'Bud' });
		await makeMemberProfile(budi.id, {
			baptized: true,
			baptismDate: '2000-01-01',
			baptismChurch: 'X'
		});
		await makePerson({ homeBranchId: a.id, fullName: 'Andi' });
		const r = await asStaff('branch_admin', a.id, () => exportMembers({ ...active, q: 'bud' }));
		expect(r.rows).toHaveLength(1);
		expect(r.rows[0]).toMatchObject({
			memberCode: budi.memberCode,
			fullName: 'Budi',
			nickname: 'Bud',
			sex: 'male',
			birthDate: '1990-01-01',
			homeBranch: a.name,
			baptized: true,
			sidi: false
		});
		expect(r.filename).toMatch(/^members-\d{4}-\d{2}-\d{2}\.xlsx$/);
	});

	it('blanks contact details of a member under 17', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		const a = await makeBranch();
		const teen = await makePerson({ homeBranchId: a.id, birthDate: '2009-11-01' });
		await makeAccount(teen.id, { email: 'teen@mail.test', phone: '+6281200000001' });
		const run = () => asStaff('branch_admin', a.id, () => exportMembers(active));
		// 23:00 on 31 October in Jakarta: still 16.
		vi.setSystemTime(new Date('2026-10-31T16:00:00Z'));
		expect((await run()).rows[0]).toMatchObject({ email: null, phone: null });
		// 01:00 on 1 November in Jakarta, still 31 October in UTC: now 17.
		vi.setSystemTime(new Date('2026-10-31T18:00:00Z'));
		expect((await run()).rows[0]).toMatchObject({
			email: 'teen@mail.test',
			phone: '+6281200000001'
		});
	});

	it("shows the oldest adult's Member ID as the household", async () => {
		const a = await makeBranch();
		const home = await makeHousehold();
		const at = (o: object) => makePerson({ homeBranchId: a.id, householdId: home.id, ...o });
		await at({ birthDate: '1940-01-01', isMember: false, memberCode: null });
		const parent = await at({ birthDate: '1960-01-01' });
		await at({ birthDate: '2015-01-01' });
		const r = await asStaff('branch_admin', a.id, () => exportMembers(active));
		expect(new Set(r.rows.map((row) => row.household))).toEqual(new Set([parent.memberCode]));
	});

	it('leaves out deceased and non-members', async () => {
		const a = await makeBranch();
		await makePerson({ homeBranchId: a.id, fullName: 'Kept' });
		await makePerson({ homeBranchId: a.id, deceasedOn: '2026-01-01' });
		await makePerson({ homeBranchId: a.id, isMember: false, memberCode: null });
		const r = await asStaff('branch_admin', a.id, () => exportMembers(active));
		expect(r.rows.map((row) => row.fullName)).toEqual(['Kept']);
	});

	it('refuses a deceased-tab export', async () => {
		const a = await makeBranch();
		await expect(
			asStaff('branch_admin', a.id, () => exportMembers({ status: 'deceased' }))
		).rejects.toThrow('error_export_deceased');
	});

	it('refuses more than 10,000 rows', async () => {
		const a = await makeBranch();
		const [city, home] = [await makeCity(), await makeHousehold()];
		const row = (i: number) => ({
			memberCode: `X-${i}`,
			fullName: `P${i}`,
			sex: 'male' as const,
			birthDate: '1990-01-01',
			addressLine: 'Jl. A',
			homeBranchId: a.id,
			householdId: home.id,
			cityId: city.id
		});
		for (let start = 0; start < 10_001; start += 5_000) {
			const n = Math.min(5_000, 10_001 - start);
			await db.insert(people).values(Array.from({ length: n }, (_, i) => row(start + i)));
		}
		const run = asStaff('branch_admin', a.id, () => exportMembers(active));
		await expect(run).rejects.toThrow(ValidationError);
		await expect(run).rejects.toThrow('error_export_too_large');
	});

	it('a pastor cannot export', async () => {
		const a = await makeBranch();
		await expect(asStaff('pastor', a.id, () => exportMembers(active))).rejects.toThrow(
			ForbiddenError
		);
	});

	it('a branch admin cannot export another branch', async () => {
		const [a, b] = [await makeBranch(), await makeBranch()];
		await expect(
			asStaff('branch_admin', a.id, () => exportMembers({ ...active, branchId: b.id }))
		).rejects.toThrow(ForbiddenError);
	});

	it('writes one audit row with filters and count, not rows', async () => {
		const a = await makeBranch();
		await makePerson({ homeBranchId: a.id, fullName: 'Budi' });
		await asStaff('branch_admin', a.id, () => exportMembers({ ...active, q: 'bud' }));
		const rows = await db.select().from(auditLogs).where(eq(auditLogs.action, 'members.exported'));
		expect(rows).toHaveLength(1);
		expect(rows[0].entityType).toBe('member_export');
		expect(rows[0].diff).toEqual({
			filters: { after: { q: 'bud', status: 'active' } },
			rowCount: { after: 1 }
		});
		expect(JSON.stringify(rows[0].diff)).not.toContain('Budi');
	});
});
