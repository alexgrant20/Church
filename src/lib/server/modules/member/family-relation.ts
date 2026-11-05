export type Link = {
	kind: 'parent' | 'spouse';
	personId: string;
	relatedPersonId: string;
	endedOn: string | null;
};
export type Relation = 'self' | 'spouse' | 'parent' | 'child' | 'sibling';

const parentsOf = (id: string, links: Link[]) =>
	links.filter((l) => l.kind === 'parent' && l.relatedPersonId === id).map((l) => l.personId);

// How the actor is related to the subject, if directly: one generation at most, so a
// grandparent, an in-law or a lodger is not "direct family" (user decision, 2026-11-05).
export function relationOf(actorId: string, subjectId: string, links: Link[]): Relation | null {
	if (actorId === subjectId) return 'self';
	const between = (a: string, b: string, kind: Link['kind']) =>
		links.some((l) => l.kind === kind && l.personId === a && l.relatedPersonId === b);
	const [x, y] = [actorId, subjectId].sort();
	const spouse = links.some(
		(l) => l.kind === 'spouse' && l.personId === x && l.relatedPersonId === y && !l.endedOn
	);
	if (spouse) return 'spouse';
	if (between(actorId, subjectId, 'parent')) return 'parent';
	if (between(subjectId, actorId, 'parent')) return 'child';
	const theirs = new Set(parentsOf(subjectId, links));
	return parentsOf(actorId, links).some((p) => theirs.has(p)) ? 'sibling' : null;
}
