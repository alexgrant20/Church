import { describe, it, expect, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import { people } from '$lib/server/db/schema';
import { resetDb } from '$lib/server/db/test/reset';
import { makeBranch, makeHousehold, makePerson } from '$lib/server/db/test/factories';
import { ForbiddenError } from '$lib/server/errors';
import { asStaff } from '$lib/server/modules/registration/test-support';
import { canViewPerson } from './access';
import { exportScope, memberScope } from './scope';

async function family() {
	const [a, b] = [await makeBranch(), await makeBranch()];
	const household = await makeHousehold();
	const inA = await makePerson({ homeBranchId: a.id, householdId: household.id });
	const inB = await makePerson({ homeBranchId: b.id, householdId: household.id });
	const stranger = await makePerson({ homeBranchId: b.id });
	return { a, b, inA, inB, stranger };
}

const view = (role: 'branch_admin' | 'superadmin', branchId: string | null, p: typeof people.$inferSelect) =>
	asStaff(role, branchId, () => canViewPerson(p, memberScope()));

describe('member access', () => {
	beforeEach(resetDb);

	it('a branch admin of A sees the B person as cross', async () => {
		const f = await family();
		expect(await view('branch_admin', f.a.id, f.inB)).toBe('cross');
	});

	it('a branch admin of A sees an A person as own', async () => {
		const f = await family();
		expect(await view('branch_admin', f.a.id, f.inA)).toBe('own');
	});

	it('a person in an unrelated B household is not viewable', async () => {
		const f = await family();
		expect(await view('branch_admin', f.a.id, f.stranger)).toBeNull();
	});

	it('a superadmin sees everyone as own', async () => {
		const f = await family();
		expect(await view('superadmin', null, f.stranger)).toBe('own');
	});

	it('a pastor of A gets member scope but not export scope', async () => {
		const f = await family();
		asStaff('pastor', f.a.id, () => {
			expect(memberScope()).toEqual([f.a.id]);
			expect(() => exportScope()).toThrow(ForbiddenError);
		});
	});

	it('a group admin is forbidden', () => {
		asStaff('group_admin', null, () => expect(() => memberScope()).toThrow(ForbiddenError));
	});

	it('a soft-deleted household member does not open the cross-branch view', async () => {
		const f = await family();
		await db.update(people).set({ deletedAt: new Date() }).where(eq(people.id, f.inA.id));
		expect(await view('branch_admin', f.a.id, f.inB)).toBeNull();
	});
});
