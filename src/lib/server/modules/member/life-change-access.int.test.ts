import { describe, it, expect, beforeEach } from 'vitest';
import { runWithContext } from '$lib/server/context';
import { db } from '$lib/server/db/client';
import { personRelationships } from '$lib/server/db/schema';
import { resetDb } from '$lib/server/db/test/reset';
import { makeBranch, makeHousehold, makePerson } from '$lib/server/db/test/factories';
import { NotFoundError } from '$lib/server/errors';
import { asStaff } from '$lib/server/modules/registration/test-support';
import { lifeChangeActor } from './life-change-access';
import { findSubject } from './life-change-repository';

const asPerson = <T>(personId: string, fn: () => T) =>
	runWithContext({ personId, actingAsPersonId: null, ip: '127.0.0.1', roleAssignments: [] }, fn);
const yearsAgo = (n: number) => `${new Date().getUTCFullYear() - n}-01-01`;

async function household() {
	const branch = await makeBranch();
	const other = await makeBranch();
	const home = await makeHousehold();
	const at = { homeBranchId: branch.id, householdId: home.id };
	const subject = await makePerson({ ...at, birthDate: yearsAgo(70) });
	const adult = await makePerson({ ...at, birthDate: yearsAgo(40) });
	const teen = await makePerson({ ...at, birthDate: `${new Date().getUTCFullYear() - 16}-12-31` });
	const late = await makePerson({ ...at, birthDate: yearsAgo(45), deceasedOn: '2020-01-01' });
	const relative = await makePerson({ homeBranchId: other.id, householdId: home.id });
	const movedAway = await makePerson({ homeBranchId: branch.id, birthDate: yearsAgo(30) });
	const stranger = await makePerson({ homeBranchId: branch.id, birthDate: yearsAgo(30) });
	const sibling = await makePerson({ ...at, birthDate: yearsAgo(38) });
	const grandchild = await makePerson({ ...at, birthDate: yearsAgo(20) });
	const lodger = await makePerson({ ...at, birthDate: yearsAgo(35) });
	const kid = await makePerson({ ...at, birthDate: yearsAgo(10) });
	await db.insert(personRelationships).values([
		{ kind: 'parent', personId: subject.id, relatedPersonId: adult.id },
		{ kind: 'parent', personId: subject.id, relatedPersonId: sibling.id },
		{ kind: 'parent', personId: adult.id, relatedPersonId: grandchild.id }
	]);
	const s = (await findSubject(subject.id))!;
	const of = async (p: { id: string }) => (await findSubject(p.id))!;
	return {
		branch,
		other,
		s,
		adult,
		teen,
		late,
		relative,
		movedAway,
		stranger,
		sibling,
		grandchild,
		lodger,
		kid,
		of
	};
}

describe('lifeChangeActor', () => {
	beforeEach(resetDb);

	it('a branch admin of the home branch is staff', async () => {
		const h = await household();
		expect(await asStaff('branch_admin', h.branch.id, () => lifeChangeActor(h.s))).toEqual({
			kind: 'staff'
		});
	});

	it('a superadmin is staff anywhere', async () => {
		const h = await household();
		expect(await asStaff('superadmin', null, () => lifeChangeActor(h.s))).toEqual({
			kind: 'staff'
		});
	});

	it('a pastor is not allowed', async () => {
		const h = await household();
		await expect(asStaff('pastor', h.branch.id, () => lifeChangeActor(h.s))).rejects.toThrow(
			NotFoundError
		);
	});

	it('an admin of another branch is not allowed, even for a household relative', async () => {
		const h = await household();
		await expect(asStaff('branch_admin', h.other.id, () => lifeChangeActor(h.s))).rejects.toThrow(
			NotFoundError
		);
	});

	it('an adult in the same household is family', async () => {
		const h = await household();
		expect(await asPerson(h.adult.id, () => lifeChangeActor(h.s))).toEqual({
			kind: 'family',
			personId: h.adult.id,
			relation: 'child'
		});
	});

	it('a 16-year-old in the household is not allowed', async () => {
		const h = await household();
		await expect(asPerson(h.teen.id, () => lifeChangeActor(h.s))).rejects.toThrow(NotFoundError);
	});

	it('a deceased adult in the household is not allowed', async () => {
		const h = await household();
		await expect(asPerson(h.late.id, () => lifeChangeActor(h.s))).rejects.toThrow(NotFoundError);
	});

	it('an adult who moved to another household is not allowed', async () => {
		const h = await household();
		await expect(asPerson(h.movedAway.id, () => lifeChangeActor(h.s))).rejects.toThrow(
			NotFoundError
		);
	});

	it('a stranger is not allowed', async () => {
		const h = await household();
		await expect(asPerson(h.stranger.id, () => lifeChangeActor(h.s))).rejects.toThrow(
			NotFoundError
		);
	});

	it('a sibling may act for an adult sibling', async () => {
		const h = await household();
		const actor = await asPerson(h.sibling.id, async () => lifeChangeActor(await h.of(h.adult)));
		expect(actor).toMatchObject({ kind: 'family', relation: 'sibling' });
	});

	it('a parent may act for an adult child', async () => {
		const h = await household();
		const actor = await asPerson(h.s.id, async () => lifeChangeActor(await h.of(h.adult)));
		expect(actor).toMatchObject({ kind: 'family', relation: 'parent' });
	});

	it('a grandchild may not act for an adult grandparent', async () => {
		const h = await household();
		await expect(asPerson(h.grandchild.id, () => lifeChangeActor(h.s))).rejects.toThrow(
			NotFoundError
		);
	});

	it('an unrelated adult in the household may not act for another adult', async () => {
		const h = await household();
		await expect(asPerson(h.lodger.id, () => lifeChangeActor(h.s))).rejects.toThrow(NotFoundError);
	});

	it('any adult of the household may act for a child', async () => {
		const h = await household();
		const actor = await asPerson(h.lodger.id, async () => lifeChangeActor(await h.of(h.kid)));
		expect(actor).toMatchObject({ kind: 'family', relation: 'household' });
	});

	it('an adult may act for themself', async () => {
		const h = await household();
		const actor = await asPerson(h.lodger.id, async () => lifeChangeActor(await h.of(h.lodger)));
		expect(actor).toMatchObject({ kind: 'family', relation: 'self' });
	});
});
