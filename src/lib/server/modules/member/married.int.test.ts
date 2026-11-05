import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import {
	accounts,
	auditLogs,
	households,
	memberProfiles,
	people,
	personRelationships
} from '$lib/server/db/schema';
import { runWithContext } from '$lib/server/context';
import { resetDb } from '$lib/server/db/test/reset';
import { makeBranch, makeCity, makeHousehold, makePerson } from '$lib/server/db/test/factories';
import { NotFoundError, ValidationError } from '$lib/server/errors';
import { asStaff } from '$lib/server/modules/registration/test-support';
import { insertSpouseLink } from './life-change-repository';
import { recordMarriage } from './married';

const asPerson = <T>(personId: string, fn: () => T) =>
	runWithContext({ personId, actingAsPersonId: null, ip: '127.0.0.1', roleAssignments: [] }, fn);
const reread = async (id: string) => (await db.select().from(people).where(eq(people.id, id)))[0];
const audits = (action: string) => db.select().from(auditLogs).where(eq(auditLogs.action, action));
const rejectsWith = (p: Promise<unknown>, key: string) =>
	expect(p).rejects.toSatisfy((e) => e instanceof ValidationError && e.message === key);

async function family(subjectBorn = '1998-03-01') {
	const branch = await makeBranch();
	const home = await makeHousehold();
	const at = { homeBranchId: branch.id, householdId: home.id };
	const parent = await makePerson({ ...at, birthDate: '1970-01-01' });
	const subject = await makePerson({ ...at, birthDate: subjectBorn });
	const city = await makeCity();
	return { branch, home, parent, subject, city };
}
const input = (f: { city: { id: string } }, over: Record<string, unknown> = {}) => ({
	weddingOn: '2026-06-01',
	spouse: { fullName: 'Rani Putri', nickname: 'Rani', sex: 'female', birthDate: '1999-02-02' },
	address: { line: 'Jl. Nikah 1', postalCode: '10110', cityId: f.city.id },
	...over
});
const asAdmin = <T>(branchId: string, fn: () => T) => asStaff('branch_admin', branchId, fn);

describe('got married, new non-member spouse', () => {
	beforeEach(resetDb);
	afterEach(() => vi.useRealTimers());

	it('a household adult records a marriage to a new non-member', async () => {
		const f = await family();
		const { householdId, spouseId } = await asPerson(f.parent.id, () =>
			recordMarriage(f.subject.id, input(f))
		);
		const [subject, spouse] = [await reread(f.subject.id), await reread(spouseId)];
		expect(subject.householdId).toBe(householdId);
		expect(spouse).toMatchObject({
			householdId,
			isMember: false,
			memberCode: null,
			addressLine: 'Jl. Nikah 1'
		});
		expect(
			await db.select().from(memberProfiles).where(eq(memberProfiles.personId, spouseId))
		).toEqual([]);
		expect(await db.select().from(accounts).where(eq(accounts.personId, spouseId))).toEqual([]);
		const links = await db.select().from(personRelationships);
		expect(links).toHaveLength(1);
		expect(links[0]).toMatchObject({ kind: 'spouse', startedOn: '2026-06-01' });
		expect((await reread(f.parent.id)).householdId).toBe(f.home.id);
		const [married] = await audits('person.married');
		expect(married).toMatchObject({ entityId: f.subject.id, actorPersonId: f.parent.id });
		expect(married.diff).toMatchObject({
			householdId: { before: f.home.id, after: householdId },
			spouseId: { after: spouseId },
			weddingOn: { after: '2026-06-01' }
		});
		const [created] = await audits('person.created');
		expect(created.diff).toEqual({
			fullName: { after: 'Rani Putri' },
			nickname: { after: 'Rani' },
			sex: { after: 'female' },
			birthDate: { after: '1999-02-02' },
			isMember: { after: false },
			householdId: { after: householdId }
		});
	});

	it('staff records the same', async () => {
		const f = await family();
		const { householdId } = await asAdmin(f.branch.id, () =>
			recordMarriage(f.subject.id, input(f))
		);
		expect((await reread(f.subject.id)).householdId).toBe(householdId);
	});

	it('the age is judged on the wedding date', async () => {
		const f = await family('2007-06-01');
		await asAdmin(f.branch.id, () => recordMarriage(f.subject.id, input(f)));
		const young = await makePerson({
			homeBranchId: f.branch.id,
			householdId: f.home.id,
			birthDate: '2007-06-02'
		});
		await rejectsWith(
			asAdmin(f.branch.id, () => recordMarriage(young.id, input(f))),
			'error_not_marriage_age'
		);
	});

	it('a new spouse under 19 is refused', async () => {
		const f = await family();
		const spouse = { fullName: 'Muda', nickname: 'Muda', sex: 'female', birthDate: '2010-01-01' };
		await rejectsWith(
			asAdmin(f.branch.id, () => recordMarriage(f.subject.id, input(f, { spouse }))),
			'error_not_marriage_age'
		);
	});

	it('someone already married is refused; an ended marriage is not', async () => {
		const f = await family();
		const ex = await makePerson();
		await db.transaction((tx) => insertSpouseLink(tx, f.subject.id, ex.id, '2020-01-01'));
		await rejectsWith(
			asAdmin(f.branch.id, () => recordMarriage(f.subject.id, input(f))),
			'error_already_married'
		);
		await db.update(personRelationships).set({ endedOn: '2024-01-01' });
		await asAdmin(f.branch.id, () => recordMarriage(f.subject.id, input(f)));
	});

	it('a deceased subject is refused', async () => {
		const f = await family();
		await db.update(people).set({ deceasedOn: '2025-01-01' }).where(eq(people.id, f.subject.id));
		await rejectsWith(
			asAdmin(f.branch.id, () => recordMarriage(f.subject.id, input(f))),
			'error_already_deceased'
		);
	});

	it('a wedding after today in the branch calendar is refused', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date('2026-10-01T18:00:00Z'));
		const f = await family();
		await rejectsWith(
			asAdmin(f.branch.id, () =>
				recordMarriage(f.subject.id, input(f, { weddingOn: '2026-10-03' }))
			),
			'error_date_in_future'
		);
		await asAdmin(f.branch.id, () =>
			recordMarriage(f.subject.id, input(f, { weddingOn: '2026-10-02' }))
		);
	});

	it("a lone subject's old household is soft-deleted", async () => {
		const branch = await makeBranch();
		const alone = await makePerson({ homeBranchId: branch.id, birthDate: '1990-01-01' });
		const city = await makeCity();
		await asAdmin(branch.id, () => recordMarriage(alone.id, input({ city })));
		const [old] = await db.select().from(households).where(eq(households.id, alone.householdId));
		expect(old.deletedAt).not.toBeNull();
	});

	it('recording the same marriage twice at once makes one marriage', async () => {
		const f = await family();
		const run = () => asAdmin(f.branch.id, () => recordMarriage(f.subject.id, input(f)));
		const results = await Promise.allSettled([run(), run()]);
		expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
		const failed = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
		expect(failed.reason.message).toBe('error_already_married');
		expect(
			await db
				.select()
				.from(people)
				.where(and(eq(people.fullName, 'Rani Putri')))
		).toHaveLength(1);
		expect(await db.select().from(personRelationships)).toHaveLength(1);
	});

	it('a stranger gets NotFoundError', async () => {
		const f = await family();
		const stranger = await makePerson({ birthDate: '1980-01-01' });
		await expect(
			asPerson(stranger.id, () => recordMarriage(f.subject.id, input(f)))
		).rejects.toThrow(NotFoundError);
	});
});
