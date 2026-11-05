import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import { auditLogs, households, people, personRelationships } from '$lib/server/db/schema';
import { runWithContext } from '$lib/server/context';
import { resetDb } from '$lib/server/db/test/reset';
import { makeBranch, makeCity, makeHousehold, makePerson } from '$lib/server/db/test/factories';
import { NotFoundError, ValidationError } from '$lib/server/errors';
import { asStaff } from '$lib/server/modules/registration/test-support';
import { recordMovedOut, undoMovedOut } from './moved-out';

const asPerson = <T>(personId: string, fn: () => T) =>
	runWithContext({ personId, actingAsPersonId: null, ip: '127.0.0.1', roleAssignments: [] }, fn);
const reread = async (id: string) => (await db.select().from(people).where(eq(people.id, id)))[0];
const household = async (id: string) =>
	(await db.select().from(households).where(eq(households.id, id)))[0];
const audits = (action: string) => db.select().from(auditLogs).where(eq(auditLogs.action, action));
const rejectsWith = (p: Promise<unknown>, key: string) =>
	expect(p).rejects.toSatisfy((e) => e instanceof ValidationError && e.message === key);

async function family() {
	const branch = await makeBranch();
	const home = await makeHousehold();
	const at = { homeBranchId: branch.id, householdId: home.id };
	const parent = await makePerson({
		...at,
		birthDate: '1970-01-01',
		addressLine: 'Jl. Lama 1',
		postalCode: '10110'
	});
	const child = await makePerson({
		...at,
		birthDate: '2000-01-01',
		addressLine: 'Jl. Lama 1',
		postalCode: '10110'
	});
	await db
		.insert(personRelationships)
		.values({ kind: 'parent', personId: parent.id, relatedPersonId: child.id });
	const city = await makeCity();
	const address = { line: 'Jl. Baru 2', postalCode: '10220', cityId: city.id };
	return { branch, home, parent, child, address };
}
const asAdmin = <T>(branchId: string, fn: () => T) => asStaff('branch_admin', branchId, fn);

describe('moved out', () => {
	beforeEach(resetDb);
	afterEach(() => vi.useRealTimers());

	it('staff moves an adult into a new household of their own', async () => {
		const f = await family();
		const { householdId } = await asAdmin(f.branch.id, () =>
			recordMovedOut(f.child.id, { address: f.address })
		);
		const child = await reread(f.child.id);
		expect(child.householdId).toBe(householdId);
		expect(householdId).not.toBe(f.home.id);
		expect((await reread(f.parent.id)).householdId).toBe(f.home.id);
		expect(child).toMatchObject({
			addressLine: 'Jl. Baru 2',
			postalCode: '10220',
			cityId: f.address.cityId
		});
		expect(await db.select().from(personRelationships)).toHaveLength(1);
		const [row] = await audits('person.moved_out');
		expect(row.diff).toEqual({
			householdId: { before: f.home.id, after: householdId },
			addressLine: { before: 'Jl. Lama 1', after: 'Jl. Baru 2' },
			postalCode: { before: f.child.postalCode, after: '10220' },
			cityId: { before: f.child.cityId, after: f.address.cityId }
		});
	});

	it('an unchanged address leaves only the household in the diff', async () => {
		const f = await family();
		const same = { line: 'Jl. Lama 1', postalCode: f.child.postalCode!, cityId: f.child.cityId };
		const { householdId } = await asAdmin(f.branch.id, () =>
			recordMovedOut(f.child.id, { address: same })
		);
		const [row] = await audits('person.moved_out');
		expect(row.diff).toEqual({ householdId: { before: f.home.id, after: householdId } });
	});

	it('a household adult may move themself out', async () => {
		const f = await family();
		await asPerson(f.child.id, () => recordMovedOut(f.child.id, { address: f.address }));
		expect((await reread(f.child.id)).householdId).not.toBe(f.home.id);
	});

	it('a 16-year-old cannot be moved out', async () => {
		const f = await family();
		const teen = await makePerson({
			homeBranchId: f.branch.id,
			householdId: f.home.id,
			birthDate: `${new Date().getUTCFullYear() - 16}-12-31`
		});
		await rejectsWith(
			asAdmin(f.branch.id, () => recordMovedOut(teen.id, { address: f.address })),
			'error_not_adult'
		);
	});

	it('turning 17 counts by the branch calendar day', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date('2026-10-01T18:00:00Z'));
		const f = await family();
		const teen = await makePerson({
			homeBranchId: f.branch.id,
			householdId: f.home.id,
			birthDate: '2009-10-02'
		});
		await asAdmin(f.branch.id, () => recordMovedOut(teen.id, { address: f.address }));
		expect((await reread(teen.id)).householdId).not.toBe(f.home.id);
	});

	it('the only person in a household cannot move out', async () => {
		const f = await family();
		const alone = await makePerson({ homeBranchId: f.branch.id, birthDate: '1990-01-01' });
		await rejectsWith(
			asAdmin(f.branch.id, () => recordMovedOut(alone.id, { address: f.address })),
			'error_already_alone'
		);
	});

	it('a deceased person cannot move out', async () => {
		const f = await family();
		await db.update(people).set({ deceasedOn: '2025-01-01' }).where(eq(people.id, f.child.id));
		await rejectsWith(
			asAdmin(f.branch.id, () => recordMovedOut(f.child.id, { address: f.address })),
			'error_already_deceased'
		);
	});

	it('move back restores household and address and closes the empty household', async () => {
		const f = await family();
		const { householdId } = await asAdmin(f.branch.id, () =>
			recordMovedOut(f.child.id, { address: f.address })
		);
		await asAdmin(f.branch.id, () => undoMovedOut(f.child.id));
		const child = await reread(f.child.id);
		expect(child).toMatchObject({
			householdId: f.home.id,
			addressLine: 'Jl. Lama 1',
			postalCode: f.child.postalCode,
			cityId: f.child.cityId
		});
		expect((await household(householdId)).deletedAt).not.toBeNull();
		expect(await audits('person.moved_out_undone')).toHaveLength(1);
	});

	it('move back undoes only the latest move', async () => {
		const f = await family();
		const first = await asAdmin(f.branch.id, () =>
			recordMovedOut(f.child.id, { address: f.address })
		);
		await makePerson({ homeBranchId: f.branch.id, householdId: first.householdId });
		const second = await asAdmin(f.branch.id, () =>
			recordMovedOut(f.child.id, { address: f.address })
		);
		await asAdmin(f.branch.id, () => undoMovedOut(f.child.id));
		expect((await reread(f.child.id)).householdId).toBe(first.householdId);
		expect((await household(second.householdId)).deletedAt).not.toBeNull();
		expect((await household(first.householdId)).deletedAt).toBeNull();
	});

	it('move back twice is refused', async () => {
		const f = await family();
		await asAdmin(f.branch.id, () => recordMovedOut(f.child.id, { address: f.address }));
		await asAdmin(f.branch.id, () => undoMovedOut(f.child.id));
		await rejectsWith(
			asAdmin(f.branch.id, () => undoMovedOut(f.child.id)),
			'error_nothing_to_undo'
		);
	});

	it('move back with no move on record is refused', async () => {
		const f = await family();
		await rejectsWith(
			asAdmin(f.branch.id, () => undoMovedOut(f.child.id)),
			'error_nothing_to_undo'
		);
	});

	it('move back is staff only', async () => {
		const f = await family();
		await asAdmin(f.branch.id, () => recordMovedOut(f.child.id, { address: f.address }));
		await expect(asPerson(f.child.id, () => undoMovedOut(f.child.id))).rejects.toThrow(
			NotFoundError
		);
	});

	it('moving the same person out twice at once moves them once', async () => {
		const f = await family();
		await makePerson({ homeBranchId: f.branch.id, householdId: f.home.id });
		const run = () =>
			asAdmin(f.branch.id, () => recordMovedOut(f.child.id, { address: f.address }));
		const results = await Promise.allSettled([run(), run(), run(), run()]);
		expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
		expect(await audits('person.moved_out')).toHaveLength(1);
	});

	it('the last two people moving out at once never leave the household empty', async () => {
		const f = await family();
		const run = (id: string) =>
			asAdmin(f.branch.id, () => recordMovedOut(id, { address: f.address }));
		const results = await Promise.allSettled([run(f.parent.id), run(f.child.id)]);
		expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
		const left = await db.select().from(people).where(eq(people.householdId, f.home.id));
		expect(left).toHaveLength(1);
	});

	it('two move backs at once move the person back once', async () => {
		const f = await family();
		await asAdmin(f.branch.id, () => recordMovedOut(f.child.id, { address: f.address }));
		const run = () => asAdmin(f.branch.id, () => undoMovedOut(f.child.id));
		const results = await Promise.allSettled([run(), run()]);
		expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
		expect(await audits('person.moved_out_undone')).toHaveLength(1);
		expect((await reread(f.child.id)).householdId).toBe(f.home.id);
	});

	it('is still 16 on the evening before their 17th birthday in Jakarta', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date('2026-10-01T16:00:00Z'));
		const f = await family();
		const teen = await makePerson({
			homeBranchId: f.branch.id,
			householdId: f.home.id,
			birthDate: '2009-10-02'
		});
		await rejectsWith(
			asAdmin(f.branch.id, () => recordMovedOut(teen.id, { address: f.address })),
			'error_not_adult'
		);
	});
});
