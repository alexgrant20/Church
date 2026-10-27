import type { RegistrationInput } from '$lib/registration/schema';

export type DerivedRelationship = { kind: 'parent' | 'spouse'; from: number; to: number };

// For 'parent', `from` is the parent. Indexes point into the people array.
export function deriveRelationships(
	people: RegistrationInput['people'],
	parentsMarried: boolean
): DerivedRelationship[] {
	const at = (relation: string) => people.flatMap((p, i) => (p.relation === relation ? [i] : []));
	const [spouse] = at('spouse');
	const parents = at('parent');
	const rows: DerivedRelationship[] = [];

	if (spouse !== undefined) rows.push({ kind: 'spouse', from: 0, to: spouse });
	for (const child of at('child')) {
		rows.push({ kind: 'parent', from: 0, to: child });
		if (spouse !== undefined && !people[child].notChildOfSpouse) {
			rows.push({ kind: 'parent', from: spouse, to: child });
		}
	}
	for (const parent of parents) {
		rows.push({ kind: 'parent', from: parent, to: 0 });
		for (const sibling of at('sibling')) rows.push({ kind: 'parent', from: parent, to: sibling });
	}
	if (parentsMarried && parents.length === 2) {
		rows.push({ kind: 'spouse', from: parents[0], to: parents[1] });
	}
	return rows;
}
