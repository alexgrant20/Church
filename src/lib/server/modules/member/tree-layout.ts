export type TreeLink = { kind: 'parent' | 'spouse'; from: string; to: string };
export type Slot = { row: number; col: number };
type Edge = { id: string; step: number };

function adjacency(links: TreeLink[]) {
	const adj = new Map<string, Edge[]>();
	const add = (a: string, b: string, step: number) =>
		adj.set(a, [...(adj.get(a) ?? []), { id: b, step }]);
	for (const l of links) {
		const step = l.kind === 'parent' ? 1 : 0;
		add(l.from, l.to, step);
		add(l.to, l.from, -step);
	}
	return adj;
}

// BFS from the root; the first generation a person is reached at wins, so bad data cannot loop.
function generations(ids: string[], adj: Map<string, Edge[]>, rootId: string) {
	const gen = new Map([[rootId, 0]]);
	const order = [rootId];
	for (let i = 0; i < order.length; i++) {
		for (const e of adj.get(order[i]) ?? []) {
			if (gen.has(e.id)) continue;
			gen.set(e.id, gen.get(order[i])! + e.step);
			order.push(e.id);
		}
	}
	for (const id of ids) if (!gen.has(id)) (gen.set(id, 0), order.push(id));
	const min = Math.min(...gen.values());
	for (const [id, g] of gen) gen.set(id, g - min);
	return { gen, order };
}

// Spouses on the same row form one unit, walked as a chain so a remarried person sits between.
function units(order: string[], gen: Map<string, number>, adj: Map<string, Edge[]>) {
	const spouses = (id: string) =>
		(adj.get(id) ?? []).filter((e) => e.step === 0 && gen.get(e.id) === gen.get(id));
	const placed = new Set<string>();
	const result: string[][] = [];
	for (const id of order) {
		if (placed.has(id)) continue;
		const unit: string[] = [];
		const walk = (p: string) => {
			if (placed.has(p)) return;
			placed.add(p);
			unit.push(p);
			spouses(p).forEach((e) => walk(e.id));
		};
		walk(chainEnd(id, spouses));
		result.push(unit);
	}
	return result;
}

// Starts the walk at an end of the spouse chain, so the middle person stays in the middle.
function chainEnd(id: string, spouses: (id: string) => Edge[]) {
	const component = [id];
	const seen = new Set(component);
	for (let i = 0; i < component.length; i++) {
		for (const e of spouses(component[i])) {
			if (!seen.has(e.id)) (seen.add(e.id), component.push(e.id));
		}
	}
	return component.find((p) => spouses(p).length <= 1) ?? id;
}

function placeRow(row: string[][], parentsOf: Map<string, string[]>, slots: Map<string, Slot>) {
	const want = (unit: string[]) => {
		const cols = unit
			.flatMap((id) => parentsOf.get(id) ?? [])
			.flatMap((p) => slots.get(p)?.col ?? []);
		return cols.length ? cols.reduce((a, b) => a + b, 0) / cols.length : Infinity;
	};
	const ranked = row.map((unit, i) => ({ unit, key: want(unit), i }));
	ranked.sort((a, b) => a.key - b.key || a.i - b.i);
	let next = 0;
	return ranked.map(({ unit, key }) => {
		// Centre the unit under its parents when there is room; never overlap the unit to the left.
		const start = Number.isFinite(key)
			? Math.max(next, Math.round(key - (unit.length - 1) / 2))
			: next;
		next = start + unit.length;
		return { unit, start };
	});
}

// shortcut: rows are placed top-down only, so ancestors are not centred over their descendants;
// add a bottom-up pass if wide families read badly.
export function layoutTree(ids: string[], links: TreeLink[], rootId: string): Map<string, Slot> {
	const adj = adjacency(links);
	const { gen, order } = generations(ids, adj, rootId);
	const parentsOf = new Map<string, string[]>();
	for (const l of links) {
		if (l.kind === 'parent') parentsOf.set(l.to, [...(parentsOf.get(l.to) ?? []), l.from]);
	}
	const rows = new Map<number, string[][]>();
	for (const unit of units(order, gen, adj)) {
		const r = gen.get(unit[0])!;
		rows.set(r, [...(rows.get(r) ?? []), unit]);
	}
	const slots = new Map<string, Slot>();
	for (const r of [...rows.keys()].sort((a, b) => a - b)) {
		for (const { unit, start } of placeRow(rows.get(r)!, parentsOf, slots)) {
			unit.forEach((id, i) => slots.set(id, { row: r, col: start + i }));
		}
	}
	return slots;
}
