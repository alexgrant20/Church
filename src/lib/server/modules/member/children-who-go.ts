import type { Link } from './family-relation';

type Resident = { id: string; householdId: string; adult: boolean };

// The last adults to leave a household take their own children under 17 with them; anyone
// else's child stays (user decision, 2026-11-05). `residents` are the living people of the
// households being left, read after the lock.
export function childrenWhoGo<R extends Resident>(
	residents: R[],
	leaverIds: string[],
	links: Link[]
) {
	const leaving = (r: R) => leaverIds.includes(r.id);
	const adultStays = (householdId: string) =>
		residents.some((r) => r.householdId === householdId && r.adult && !leaving(r));
	const parentOf = (child: R) =>
		residents.find(
			(p) =>
				leaving(p) &&
				p.householdId === child.householdId &&
				links.some(
					(l) => l.kind === 'parent' && l.personId === p.id && l.relatedPersonId === child.id
				)
		);
	return residents.flatMap((child) => {
		if (child.adult || leaving(child) || adultStays(child.householdId)) return [];
		const parent = parentOf(child);
		return parent ? [{ child, parentId: parent.id }] : [];
	});
}
