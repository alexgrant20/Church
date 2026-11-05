import { getContext } from '$lib/server/context';
import { NotFoundError } from '$lib/server/errors';
import { cityNames } from '$lib/server/modules/location/service';
import { isAdult, lifeChangeActor } from './life-change-access';
import { findSubject, householdMembers } from './life-change-repository';
import { subjectOf } from './passed-away';

export type HouseholdPerson = {
	id: string;
	fullName: string;
	isSelf: boolean;
	adult: boolean;
	deceased: boolean;
	canRecordDeath: boolean;
	canMoveOut: boolean;
};

// Only a living adult sees and changes their household; anyone else is told nothing.
async function me() {
	const personId = getContext().personId;
	const self = personId ? await findSubject(personId) : undefined;
	if (!self || self.deceasedOn || !isAdult(self)) throw new NotFoundError('Household', '');
	return self;
}

export async function getMyHousehold(): Promise<{ people: HouseholdPerson[] }> {
	const self = await me();
	const rows = await householdMembers(self.householdId);
	const living = rows.filter((r) => r.deceasedOn === null).length;
	const people = rows.map((r) => {
		const deceased = r.deceasedOn !== null;
		const adult = isAdult(r);
		const isSelf = r.id === self.id;
		return {
			id: r.id,
			fullName: r.fullName,
			isSelf,
			adult,
			deceased,
			canRecordDeath: !isSelf && !deceased,
			canMoveOut: !deceased && adult && living > 1
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
