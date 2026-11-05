import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import { accounts, auditLogs, people, sessions } from '$lib/server/db/schema';
import { runWithContext } from '$lib/server/context';
import { resetDb } from '$lib/server/db/test/reset';
import { makeAccount, makeBranch, makeHousehold, makePerson } from '$lib/server/db/test/factories';
import { NotFoundError, ValidationError } from '$lib/server/errors';
import { asStaff } from '$lib/server/modules/registration/test-support';
import { recordPassedAway, undoPassedAway } from './passed-away';

const asPerson = <T>(personId: string, fn: () => T) =>
	runWithContext({ personId, actingAsPersonId: null, ip: '127.0.0.1', roleAssignments: [] }, fn);
const audits = (action: string) => db.select().from(auditLogs).where(eq(auditLogs.action, action));
const reread = async (id: string) => (await db.select().from(people).where(eq(people.id, id)))[0];
const statusOf = async (id: string) =>
	(await db.select().from(accounts).where(eq(accounts.personId, id)))[0].status;

async function family() {
	const branch = await makeBranch();
	const home = await makeHousehold();
	const at = { homeBranchId: branch.id, householdId: home.id };
	const grandpa = await makePerson({ ...at, birthDate: '1940-05-05' });
	const adult = await makePerson({ ...at, birthDate: '1980-01-01' });
	return { branch, grandpa, adult };
}
const asAdmin = <T>(branchId: string, fn: () => T) => asStaff('branch_admin', branchId, fn);
const rejectsWith = (p: Promise<unknown>, key: string) =>
	expect(p).rejects.toSatisfy((e) => e instanceof ValidationError && e.message === key);

describe('passed away', () => {
	beforeEach(resetDb);
	afterEach(() => vi.useRealTimers());

	it('staff records a death; the account is suspended and sessions end', async () => {
		const f = await family();
		await makeAccount(f.grandpa.id);
		await db.insert(sessions).values({
			id: 'b'.repeat(64),
			personId: f.grandpa.id,
			expiresAt: new Date(Date.now() + 3_600_000)
		});
		await asAdmin(f.branch.id, () => recordPassedAway(f.grandpa.id, { deceasedOn: '2026-10-01' }));
		expect((await reread(f.grandpa.id)).deceasedOn).toBe('2026-10-01');
		expect(await statusOf(f.grandpa.id)).toBe('suspended');
		expect(await db.select().from(sessions).where(eq(sessions.personId, f.grandpa.id))).toEqual([]);
		const [row] = await audits('person.passed_away');
		expect(row).toMatchObject({
			entityType: 'person',
			entityId: f.grandpa.id,
			branchId: f.branch.id,
			diff: {
				deceasedOn: { before: null, after: '2026-10-01' },
				accountStatus: { before: 'active', after: 'suspended' }
			}
		});
	});

	it('a death without an account has no accountStatus in the diff', async () => {
		const f = await family();
		await asAdmin(f.branch.id, () => recordPassedAway(f.grandpa.id, { deceasedOn: '2026-10-01' }));
		const [row] = await audits('person.passed_away');
		expect(row.diff).toEqual({ deceasedOn: { before: null, after: '2026-10-01' } });
	});

	it('a household adult records a death', async () => {
		const f = await family();
		await asPerson(f.adult.id, () => recordPassedAway(f.grandpa.id, { deceasedOn: '2026-10-01' }));
		const [row] = await audits('person.passed_away');
		expect(row.actorPersonId).toBe(f.adult.id);
	});

	it('a family member cannot record their own death', async () => {
		const f = await family();
		await rejectsWith(
			asPerson(f.adult.id, () => recordPassedAway(f.adult.id, { deceasedOn: '2026-10-01' })),
			'error_cannot_record_own_death'
		);
	});

	it('judges "future" by the branch calendar day', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date('2026-10-01T18:00:00Z'));
		const f = await family();
		await rejectsWith(
			asAdmin(f.branch.id, () => recordPassedAway(f.grandpa.id, { deceasedOn: '2026-10-03' })),
			'error_date_in_future'
		);
		await asAdmin(f.branch.id, () => recordPassedAway(f.grandpa.id, { deceasedOn: '2026-10-02' }));
		expect((await reread(f.grandpa.id)).deceasedOn).toBe('2026-10-02');
	});

	it('a date before birth is refused', async () => {
		const f = await family();
		await rejectsWith(
			asAdmin(f.branch.id, () => recordPassedAway(f.grandpa.id, { deceasedOn: '1939-01-01' })),
			'error_before_birth'
		);
	});

	it('recording twice is refused once', async () => {
		const f = await family();
		const run = () =>
			asAdmin(f.branch.id, () => recordPassedAway(f.grandpa.id, { deceasedOn: '2026-10-01' }));
		const results = await Promise.allSettled([run(), run()]);
		expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
		const failed = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
		expect(failed.reason.message).toBe('error_already_deceased');
		expect(await audits('person.passed_away')).toHaveLength(1);
	});

	it('undo clears the date and reactivates the account', async () => {
		const f = await family();
		await makeAccount(f.grandpa.id);
		await asAdmin(f.branch.id, () => recordPassedAway(f.grandpa.id, { deceasedOn: '2026-10-01' }));
		await asAdmin(f.branch.id, () => undoPassedAway(f.grandpa.id));
		expect((await reread(f.grandpa.id)).deceasedOn).toBeNull();
		expect(await statusOf(f.grandpa.id)).toBe('active');
		const [row] = await audits('person.passed_away_undone');
		expect(row.diff).toEqual({
			deceasedOn: { before: '2026-10-01', after: null },
			accountStatus: { before: 'suspended', after: 'active' }
		});
	});

	it('undo of a living person is refused', async () => {
		const f = await family();
		await rejectsWith(
			asAdmin(f.branch.id, () => undoPassedAway(f.grandpa.id)),
			'error_not_deceased'
		);
	});

	it('undo is staff only', async () => {
		const f = await family();
		await asAdmin(f.branch.id, () => recordPassedAway(f.grandpa.id, { deceasedOn: '2026-10-01' }));
		await expect(asPerson(f.adult.id, () => undoPassedAway(f.grandpa.id))).rejects.toThrow(
			NotFoundError
		);
	});
});
