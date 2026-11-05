import { describe, it, expect, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import { people, personRelationships } from '$lib/server/db/schema';
import { resetDb } from '$lib/server/db/test/reset';
import { makeHousehold, makePerson } from '$lib/server/db/test/factories';
import { hasLiveSpouse, insertPerson, insertSpouseLink } from './life-change-repository';

describe('marriage repository', () => {
	beforeEach(resetDb);

	it('knows who has a live spouse', async () => {
		const [a, b, c, d, e, f] = await Promise.all(Array.from({ length: 6 }, () => makePerson()));
		await db.transaction((tx) => insertSpouseLink(tx, a.id, b.id, '2020-01-01'));
		await db.transaction((tx) => insertSpouseLink(tx, c.id, d.id, '2010-01-01'));
		await db
			.update(personRelationships)
			.set({ endedOn: '2015-01-01' })
			.where(eq(personRelationships.personId, [c.id, d.id].sort()[0]));
		await db.transaction((tx) => insertSpouseLink(tx, e.id, f.id, '2010-01-01'));
		await db
			.update(personRelationships)
			.set({ deletedAt: new Date() })
			.where(eq(personRelationships.personId, [e.id, f.id].sort()[0]));
		expect(await hasLiveSpouse(a.id)).toBe(true);
		expect(await hasLiveSpouse(b.id)).toBe(true);
		expect(await hasLiveSpouse(c.id)).toBe(false);
		expect(await hasLiveSpouse(e.id)).toBe(false);
	});

	it('orders the spouse link ids whichever way they come', async () => {
		const [a, b] = await Promise.all([makePerson(), makePerson()]);
		const [high, low] = [a.id, b.id].sort().reverse();
		await db.transaction((tx) => insertSpouseLink(tx, high, low, '2021-05-05'));
		const [row] = await db.select().from(personRelationships);
		expect(row).toMatchObject({
			kind: 'spouse',
			personId: low,
			relatedPersonId: high,
			startedOn: '2021-05-05'
		});
	});

	it('inserts a non-member with no Member ID', async () => {
		const anchor = await makePerson();
		const household = await makeHousehold();
		const id = await db.transaction((tx) =>
			insertPerson(tx, {
				fullName: 'Rani',
				nickname: 'Rani',
				sex: 'female',
				birthDate: '1995-01-01',
				homeBranchId: anchor.homeBranchId,
				householdId: household.id,
				addressLine: 'Jl. Nikah 1',
				postalCode: '10110',
				cityId: anchor.cityId
			})
		);
		const [row] = await db.select().from(people).where(eq(people.id, id));
		expect(row).toMatchObject({ isMember: false, memberCode: null, fullName: 'Rani' });
	});
});
