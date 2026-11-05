import { getContext } from '$lib/server/context';
import { ForbiddenError, NotFoundError } from '$lib/server/errors';
import { branchInScope, scopeFor } from '$lib/server/modules/branch/access';
import { ADULT_AGE, ageOn, todayIn } from '$lib/server/time';
import { relationOf, type Relation } from './family-relation';
import { familyLinks, findSubject, type Subject } from './life-change-repository';

// 'household' is any adult of the household acting for a child, whom anyone there may look after.
export type FamilyRelation = Relation | 'household';
export type Actor =
	{ kind: 'staff' } | { kind: 'family'; personId: string; relation: FamilyRelation };

export const isAdult = (p: Pick<Subject, 'birthDate' | 'timezone'>) =>
	ageOn(p.birthDate, todayIn(p.timezone)) >= ADULT_AGE;

// Pastors read members but do not change them; cross-branch views never edit.
export function isStaffFor(subject: Pick<Subject, 'homeBranchId'>) {
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
	const relation = family ? await relationTo(actor, subject) : null;
	if (!actor || !relation) throw new NotFoundError('Person', subject.id);
	return { kind: 'family', personId: actor.id, relation };
}

// An adult acts for another adult only as direct family; for a child, any household adult may.
async function relationTo(actor: Subject, subject: Subject): Promise<FamilyRelation | null> {
	const links = await familyLinks([actor.id, subject.id]);
	const relation = relationOf(actor.id, subject.id, links);
	return relation ?? (isAdult(subject) ? null : 'household');
}

// The audit row names the family tie the actor used; staff need none.
export const actedAs = (actor: Actor) =>
	actor.kind === 'family' ? { actedAs: actor.relation } : undefined;

export function staffOnly(subject: Subject) {
	if (!isStaffFor(subject)) throw new NotFoundError('Person', subject.id);
}
