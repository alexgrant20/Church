import { getContext } from '$lib/server/context';
import { ForbiddenError, NotFoundError } from '$lib/server/errors';
import { branchInScope, scopeFor } from '$lib/server/modules/branch/access';
import { ADULT_AGE, ageOn, todayIn } from '$lib/server/time';
import { findSubject, type Subject } from './life-change-repository';

export type Actor = { kind: 'staff' } | { kind: 'family'; personId: string };

export const isAdult = (p: Pick<Subject, 'birthDate' | 'timezone'>) =>
	ageOn(p.birthDate, todayIn(p.timezone)) >= ADULT_AGE;

// Pastors read members but do not change them; cross-branch views never edit.
function isStaffFor(subject: Subject) {
	try {
		return branchInScope(scopeFor(['superadmin', 'branch_admin']), subject.homeBranchId);
	} catch (err) {
		if (err instanceof ForbiddenError) return false;
		throw err;
	}
}

// NotFoundError for everyone else, so the answer never confirms the person exists.
export async function lifeChangeActor(subject: Subject): Promise<Actor> {
	if (isStaffFor(subject)) return { kind: 'staff' };
	const personId = getContext().personId;
	const actor = personId ? await findSubject(personId) : undefined;
	const family =
		actor &&
		actor.deceasedOn === null &&
		actor.householdId === subject.householdId &&
		isAdult(actor);
	if (!family) throw new NotFoundError('Person', subject.id);
	return { kind: 'family', personId: actor.id };
}

export function staffOnly(subject: Subject) {
	if (!isStaffFor(subject)) throw new NotFoundError('Person', subject.id);
}
