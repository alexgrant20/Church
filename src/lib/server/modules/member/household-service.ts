import { getContext } from '$lib/server/context';
import { NotFoundError } from '$lib/server/errors';
import { cityNames } from '$lib/server/modules/location/service';
import { isAdult, lifeChangeActor } from './life-change-access';
import { relationOf } from './family-relation';
import { familyLinks, findSubject, householdMembers } from './life-change-repository';
import { liveSpouseIds } from './marriage-repository';
import { marriageRule } from './married';
import { todayIn } from '$lib/server/time';
import { subjectOf } from './passed-away';

export type HouseholdPerson = {
	id: string;
	fullName: string;
	isSelf: boolean;
	adult: boolean;
	deceased: boolean;
	canRecordDeath: boolean;
	canMoveOut: boolean;
	canMarry: boolean;
};

// Only a living adult sees and changes their household; anyone else is told nothing.
async function me() {
	const personId = getContext().personId;
	const self = personId ? await findSubject(personId) : undefined;
	if (!self || self.deceasedOn || !isAdult(self)) throw new NotFoundError('Household', '');
	return self;
}

export async function canOpenMyHousehold() {
	try {
		await me();
		return true;
	} catch (err) {
		if (err instanceof NotFoundError) return false;
		throw err;
	}
}

export async function getMyHousehold(): Promise<{ people: HouseholdPerson[] }> {
	const self = await me();
	const rows = await householdMembers(self.householdId);
	const living = rows.filter((r) => r.deceasedOn === null).length;
	const ids = rows.map((r) => r.id);
	const [married, links] = await Promise.all([liveSpouseIds(ids), familyLinks(ids)]);
	const people = rows.map((r) => {
		const deceased = r.deceasedOn !== null;
		const adult = isAdult(r);
		const isSelf = r.id === self.id;
		// Another adult only as direct family; any child of the household (user decision).
		const mayAct = !adult || relationOf(self.id, r.id, links) !== null;
		return {
			id: r.id,
			fullName: r.fullName,
			isSelf,
			adult,
			deceased,
			canRecordDeath: mayAct && !isSelf && !deceased,
			canMoveOut: mayAct && !deceased && adult && living > 1,
			canMarry: mayAct && marriageRule(r, married.has(r.id), todayIn(r.timezone)) === null
		};
	});
	return { people };
}

export async function getHouseholdMember(id: string) {
	const subject = await subjectOf(id);
	await lifeChangeActor(subject);
	const names = await cityNames([subject.cityId]);
	return {
		id: subject.id,
		fullName: subject.fullName,
		address: {
			line: subject.addressLine,
			postalCode: subject.postalCode,
			cityId: subject.cityId,
			city: names[subject.cityId] ?? ''
		}
	};
}
