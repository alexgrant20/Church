import { describe, it, expect, beforeEach } from 'vitest';
import { runWithContext } from '$lib/server/context';
import { db } from '$lib/server/db/client';
import { insertSpouseLink } from './life-change-repository';
import { resetDb } from '$lib/server/db/test/reset';
import { makeBranch, makeHousehold, makePerson } from '$lib/server/db/test/factories';
import { NotFoundError } from '$lib/server/errors';
import { canOpenMyHousehold, getHouseholdMember, getMyHousehold } from './household-service';

const asPerson = <T>(personId: string, fn: () => T) =>
	runWithContext({ personId, actingAsPersonId: null, ip: '127.0.0.1', roleAssignments: [] }, fn);
const year = new Date().getUTCFullYear();

async function home() {
	const branch = await makeBranch();
	const h = await makeHousehold();
	const at = { homeBranchId: branch.id, householdId: h.id };
	const me = await makePerson({ ...at, fullName: 'Me', birthDate: `${year - 45}-01-01` });
	const spouse = await makePerson({ ...at, fullName: 'Spouse', birthDate: `${year - 44}-01-01` });
	const kid = await makePerson({ ...at, fullName: 'Kid', birthDate: `${year - 10}-01-01` });
	const late = await makePerson({
		...at,
		fullName: 'Late',
		birthDate: `${year - 80}-01-01`,
		deceasedOn: '2024-01-01'
	});
	const teen = await makePerson({ ...at, fullName: 'Teen', birthDate: `${year - 16}-12-31` });
	return { me, spouse, kid, late, teen };
}

describe('my household', () => {
	beforeEach(resetDb);

	it('lists my household with what I may do', async () => {
		const h = await home();
		const { people } = await asPerson(h.me.id, getMyHousehold);
		expect(people.map((p) => p.fullName)).toEqual(['Late', 'Me', 'Spouse', 'Teen', 'Kid']);
		const of = (name: string) => people.find((p) => p.fullName === name)!;
		expect(of('Me')).toMatchObject({ isSelf: true, canRecordDeath: false, canMoveOut: true });
		expect(of('Spouse')).toMatchObject({ canRecordDeath: true, canMoveOut: true });
		expect(of('Kid')).toMatchObject({ adult: false, canRecordDeath: true, canMoveOut: false });
		expect(of('Late')).toMatchObject({ deceased: true, canRecordDeath: false, canMoveOut: false });
	});

	it('nobody may move out of a household where they live alone', async () => {
		const branch = await makeBranch();
		const alone = await makePerson({ homeBranchId: branch.id, birthDate: `${year - 30}-01-01` });
		const { people } = await asPerson(alone.id, getMyHousehold);
		expect(people[0]).toMatchObject({ isSelf: true, canMoveOut: false });
	});

	it('a 16-year-old gets NotFoundError', async () => {
		const h = await home();
		await expect(asPerson(h.teen.id, getMyHousehold)).rejects.toThrow(NotFoundError);
	});

	it('getHouseholdMember returns a household member with their address', async () => {
		const h = await home();
		const p = await asPerson(h.me.id, () => getHouseholdMember(h.spouse.id));
		expect(p).toMatchObject({ id: h.spouse.id, fullName: 'Spouse' });
		expect(p.address.cityId).toBe(h.spouse.cityId);
		expect(typeof p.address.city).toBe('string');
	});

	it('getHouseholdMember refuses someone outside my household', async () => {
		const h = await home();
		const stranger = await makePerson();
		await expect(asPerson(h.me.id, () => getHouseholdMember(stranger.id))).rejects.toThrow(
			NotFoundError
		);
	});

	it('says whether I may open my household', async () => {
		const h = await home();
		expect(await asPerson(h.me.id, canOpenMyHousehold)).toBe(true);
		expect(await asPerson(h.teen.id, canOpenMyHousehold)).toBe(false);
		expect(await asPerson(h.late.id, canOpenMyHousehold)).toBe(false);
	});

	it('says who may be recorded as married', async () => {
		const h = await home();
		const flags = async () =>
			Object.fromEntries(
				(await asPerson(h.me.id, getMyHousehold)).people.map((p) => [p.fullName, p.canMarry])
			);
		expect(await flags()).toMatchObject({
			Me: true,
			Spouse: true,
			Teen: false,
			Kid: false,
			Late: false
		});
		await db.transaction((tx) => insertSpouseLink(tx, h.me.id, h.spouse.id, '2010-01-01'));
		expect(await flags()).toMatchObject({ Me: false, Spouse: false });
	});

	it('someone widowed may be recorded as married again', async () => {
		const h = await home();
		await db.transaction((tx) => insertSpouseLink(tx, h.me.id, h.late.id, '1990-01-01'));
		const me = (await asPerson(h.me.id, getMyHousehold)).people.find((p) => p.isSelf)!;
		expect(me.canMarry).toBe(true);
	});
});
