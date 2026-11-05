// Shared by the tree service and the diagram; no server imports, so the client bundle can use it.

export type TreeNode = {
	id: string;
	fullName: string;
	memberCode: string | null;
	isMember: boolean;
	deceased: boolean;
	linkable: boolean;
	row: number;
	col: number;
};
export type TreeLinkView = { kind: 'parent' | 'spouse'; from: string; to: string; ended: boolean };
export type FamilyTreeView = { rootId: string; nodes: TreeNode[]; links: TreeLinkView[] };
export type FamilyTree = FamilyTreeView & {
	rootName: string;
	access: 'own' | 'cross';
	truncated: boolean;
};

// rem, so the diagram grows with the OS text size.
export const W = 10;
export const H = 3.5;
export const COL = W + 1.5;
export const ROW = H + 3;
const GAP = ROW - H;
export const centre = (col: number) => col * COL + W / 2;

function spouseLine(a: TreeNode, b: TreeNode, ended: boolean) {
	const [left, right] = a.col < b.col ? [a, b] : [b, a];
	const top = left.row * ROW;
	if (right.col - left.col === 1) {
		const y = top + H / 2;
		return { y, ended, d: `M${left.col * COL + W} ${y}H${right.col * COL}` };
	}
	// Someone sits between them, so the line goes over the row instead of behind a box.
	const y = top - GAP / 4;
	return { y, ended, d: `M${centre(left.col)} ${top}V${y}H${centre(right.col)}V${top}` };
}

function spouseLines(t: FamilyTreeView, at: Map<string, TreeNode>) {
	return t.links.flatMap((l) => {
		const [a, b] = [at.get(l.from), at.get(l.to)];
		if (l.kind !== 'spouse' || !a || !b || a.row !== b.row) return [];
		return [{ key: `${l.from}-${l.to}`, ...spouseLine(a, b, l.ended) }];
	});
}

type Family = { key: string; parents: TreeNode[]; children: TreeNode[] };

function families(t: FamilyTreeView, at: Map<string, TreeNode>): Family[] {
	const byKey = new Map<string, Family>();
	for (const child of t.nodes) {
		const parents = t.links
			.filter((l) => l.kind === 'parent' && l.to === child.id)
			.flatMap((l) => at.get(l.from) ?? [])
			.sort((a, b) => a.col - b.col);
		if (!parents.length) continue;
		const key = parents.map((p) => p.id).join('+');
		const family = byKey.get(key) ?? { key, parents, children: [] };
		family.children.push(child);
		byKey.set(key, family);
	}
	return [...byKey.values()];
}

// An adjacent couple shares one drop from their spouse line; otherwise each parent gets their own.
function starts({ parents: p }: Family) {
	if (p.length === 2 && p[0].row === p[1].row && p[1].col - p[0].col === 1) {
		return [{ x: (centre(p[0].col) + centre(p[1].col)) / 2, y: p[0].row * ROW + H / 2 }];
	}
	return p.map((n) => ({ x: centre(n.col), y: n.row * ROW + H }));
}

function familyLines(t: FamilyTreeView, at: Map<string, TreeNode>) {
	const all = families(t, at).map((f) => ({ f, from: starts(f), row: f.children[0].row }));
	// Each family above a row gets its own elbow height, so sibling families never merge lines.
	return all.map(({ f, from, row }) => {
		const lane = all
			.filter((o) => o.row === row)
			.sort((a, b) => a.from[0].x - b.from[0].x)
			.findIndex((o) => o.f === f);
		const lanes = all.filter((o) => o.row === row).length;
		const elbow = row * ROW - GAP + ((lane + 1) * GAP) / (lanes + 1);
		const xs = [...from.map((s) => s.x), ...f.children.map((c) => centre(c.col))];
		const d = [
			...from.map((s) => `M${s.x} ${s.y}V${elbow}`),
			`M${Math.min(...xs)} ${elbow}H${Math.max(...xs)}`,
			...f.children.map((c) => `M${centre(c.col)} ${elbow}V${c.row * ROW}`)
		].join('');
		return { key: f.key, d, elbow, starts: from.map((s) => s.x) };
	});
}

export function treeLines(t: FamilyTreeView) {
	const at = new Map(t.nodes.map((n) => [n.id, n]));
	return { spouses: spouseLines(t, at), families: familyLines(t, at) };
}

// The relations the diagram shows by lines, as words for screen readers.
export function relationsOf(t: FamilyTreeView, id: string) {
	const name = new Map(t.nodes.map((n) => [n.id, n.fullName]));
	const names = (ids: string[]) => ids.flatMap((i) => name.get(i) ?? []);
	const mine = t.links.filter((l) => l.from === id || l.to === id);
	const other = (l: TreeLinkView) => (l.from === id ? l.to : l.from);
	const spouses = mine.filter((l) => l.kind === 'spouse');
	return {
		parents: names(mine.filter((l) => l.kind === 'parent' && l.to === id).map((l) => l.from)),
		children: names(mine.filter((l) => l.kind === 'parent' && l.from === id).map((l) => l.to)),
		spouses: names(spouses.filter((l) => !l.ended).map(other)),
		formerSpouses: names(spouses.filter((l) => l.ended).map(other))
	};
}
