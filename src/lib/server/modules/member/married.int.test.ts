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
import { findSubject } from './life-change-repository';
import { insertSpouseLink } from './marriage-repository';
import { marry, recordMarriage, recordMarriageToMember } from './married';
import { recordPassedAway } from './passed-away';

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
	await db
		.insert(personRelationships)
		.values({ kind: 'parent', personId: parent.id, relatedPersonId: subject.id });
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
		const links = await db
			.select()
			.from(personRelationships)
			.where(eq(personRelationships.kind, 'spouse'));
		expect(links).toHaveLength(1);
		expect(links[0]).toMatchObject({ kind: 'spouse', startedOn: '2026-06-01' });
		expect((await reread(f.parent.id)).householdId).toBe(f.home.id);
		const [married] = await audits('person.married');
		expect(married).toMatchObject({ entityId: f.subject.id, actorPersonId: f.parent.id });
		expect(married.metadata).toMatchObject({ actedAs: 'parent' });
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
			householdId: { after: householdId },
			homeBranchId: { after: f.branch.id },
			addressLine: { after: 'Jl. Nikah 1' },
			postalCode: { after: '10110' },
			cityId: { after: f.city.id }
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
		expect(
			await db.select().from(personRelationships).where(eq(personRelationships.kind, 'spouse'))
		).toHaveLength(1);
	});

	it('a stranger gets NotFoundError', async () => {
		const f = await family();
		const stranger = await makePerson({ birthDate: '1980-01-01' });
		await expect(
			asPerson(stranger.id, () => recordMarriage(f.subject.id, input(f)))
		).rejects.toThrow(NotFoundError);
	});
});

describe('got married after being widowed', () => {
	beforeEach(resetDb);

	it('a widow may marry again once the spouse’s death is recorded', async () => {
		const f = await family();
		const { spouseId } = await asAdmin(f.branch.id, () => recordMarriage(f.subject.id, input(f)));
		await asAdmin(f.branch.id, () => recordPassedAway(spouseId, { deceasedOn: '2026-07-01' }));
		const again = input(f, {
			weddingOn: '2026-09-01',
			spouse: { fullName: 'Second', nickname: 'Second', sex: 'female', birthDate: '1997-01-01' }
		});
		await asAdmin(f.branch.id, () => recordMarriage(f.subject.id, again));
		expect(await audits('person.married')).toHaveLength(2);
	});
});

describe('got married, two people on record', () => {
	beforeEach(resetDb);

	async function couple() {
		const f = await family();
		const bride = await makePerson({ homeBranchId: f.branch.id, birthDate: '1999-09-09' });
		const toMember = (spouseId: string) => ({
			weddingOn: '2026-06-01',
			spouseId,
			address: { line: 'Jl. Nikah 2', postalCode: '10220', cityId: f.city.id }
		});
		return { ...f, bride, toMember };
	}

	it('staff marries two people from different households', async () => {
		const c = await couple();
		const { householdId } = await asAdmin(c.branch.id, () =>
			recordMarriageToMember(c.subject.id, c.toMember(c.bride.id))
		);
		const [groom, bride] = [await reread(c.subject.id), await reread(c.bride.id)];
		expect(groom).toMatchObject({ householdId, addressLine: 'Jl. Nikah 2' });
		expect(bride).toMatchObject({ householdId, addressLine: 'Jl. Nikah 2' });
		expect(
			await db.select().from(personRelationships).where(eq(personRelationships.kind, 'spouse'))
		).toHaveLength(1);
		const rows = await audits('person.married');
		expect(rows).toHaveLength(2);
		const spouseOf = (id: string) =>
			(rows.find((r) => r.entityId === id)!.diff as { spouseId: { after: string } }).spouseId.after;
		expect(spouseOf(c.subject.id)).toBe(c.bride.id);
		expect(spouseOf(c.bride.id)).toBe(c.subject.id);
	});

	it('a household left with someone stays live; one left empty is closed', async () => {
		const c = await couple();
		await asAdmin(c.branch.id, () => recordMarriageToMember(c.subject.id, c.toMember(c.bride.id)));
		const live = async (id: string) =>
			(await db.select().from(households).where(eq(households.id, id)))[0].deletedAt === null;
		expect(await live(c.home.id)).toBe(true);
		expect(await live(c.bride.householdId)).toBe(false);
	});

	it('the same person twice is refused', async () => {
		const c = await couple();
		await rejectsWith(
			asAdmin(c.branch.id, () => recordMarriageToMember(c.subject.id, c.toMember(c.subject.id))),
			'error_same_person'
		);
	});

	it('the other person must be marriage age, alive and unmarried', async () => {
		const c = await couple();
		const young = await makePerson({ homeBranchId: c.branch.id, birthDate: '2010-01-01' });
		await rejectsWith(
			asAdmin(c.branch.id, () => recordMarriageToMember(c.subject.id, c.toMember(young.id))),
			'error_not_marriage_age'
		);
		const late = await makePerson({
			homeBranchId: c.branch.id,
			birthDate: '1990-01-01',
			deceasedOn: '2024-01-01'
		});
		await rejectsWith(
			asAdmin(c.branch.id, () => recordMarriageToMember(c.subject.id, c.toMember(late.id))),
			'error_already_deceased'
		);
		const wed = await makePerson({ homeBranchId: c.branch.id, birthDate: '1990-01-01' });
		await db.transaction((tx) => insertSpouseLink(tx, wed.id, c.bride.id, '2020-01-01'));
		await rejectsWith(
			asAdmin(c.branch.id, () => recordMarriageToMember(c.subject.id, c.toMember(wed.id))),
			'error_already_married'
		);
	});

	it('a spouse outside scope reads the same as one that does not exist', async () => {
		const c = await couple();
		const elsewhere = await makePerson({ birthDate: '1999-01-01' });
		await rejectsWith(
			asAdmin(c.branch.id, () => recordMarriageToMember(c.subject.id, c.toMember(elsewhere.id))),
			'error_spouse_unavailable'
		);
		await rejectsWith(
			asAdmin(c.branch.id, () =>
				recordMarriageToMember(c.subject.id, c.toMember(crypto.randomUUID()))
			),
			'error_spouse_unavailable'
		);
	});

	it('a person who moved since they were read loses with "changed meanwhile"', async () => {
		const c = await couple();
		const stale = (await findSubject(c.subject.id))!;
		await db
			.update(people)
			.set({ householdId: c.bride.householdId })
			.where(eq(people.id, c.subject.id));
		const wedding = {
			weddingOn: '2026-06-01',
			address: { addressLine: 'Jl. X', postalCode: '10110', cityId: c.city.id }
		};
		await rejectsWith(
			db.transaction((tx) =>
				marry(tx, [stale], wedding, {
					fullName: 'N',
					nickname: 'N',
					sex: 'female',
					birthDate: '1990-01-01'
				})
			),
			'error_changed_meanwhile'
		);
	});

	it('a family adult cannot use it', async () => {
		const c = await couple();
		await expect(
			asPerson(c.parent.id, () => recordMarriageToMember(c.subject.id, c.toMember(c.bride.id)))
		).rejects.toThrow(NotFoundError);
	});
});
