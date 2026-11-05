import { describe, it, expect } from 'vitest';
import { centre, H, ROW, relationsOf, treeLines, type FamilyTreeView } from './family-tree';

type Slot = [id: string, row: number, col: number];
const view = (slots: Slot[], links: FamilyTreeView['links']): FamilyTreeView => ({
	rootId: slots[0][0],
	nodes: slots.map(([id, row, col]) => ({
		id,
		fullName: id.toUpperCase(),
		memberCode: null,
		isMember: true,
		deceased: false,
		linkable: true,
		row,
		col
	})),
	links
});
const parent = (from: string, to: string) => ({ kind: 'parent' as const, from, to, ended: false });
const spouse = (from: string, to: string, ended = false) => ({
	kind: 'spouse' as const,
	from,
	to,
	ended
});

describe('treeLines', () => {
	it('drops one line from the middle of an adjacent couple', () => {
		const t = view(
			[
				['a', 0, 0],
				['b', 0, 1],
				['c', 1, 0]
			],
			[spouse('a', 'b'), parent('a', 'c'), parent('b', 'c')]
		);
		const [family] = treeLines(t).families;
		expect(family.starts).toEqual([(centre(0) + centre(1)) / 2]);
	});

	it('draws from each parent when the parents are not side by side', () => {
		const t = view(
			[
				['s1', 0, 0],
				['r', 0, 1],
				['s2', 0, 2],
				['s3', 0, 3],
				['c', 1, 3]
			],
			[spouse('s1', 'r'), spouse('r', 's2'), spouse('r', 's3'), parent('r', 'c'), parent('s3', 'c')]
		);
		const [family] = treeLines(t).families;
		expect(family.starts).toEqual([centre(1), centre(3)]);
	});

	it('co-parents without a spouse row each get their own line', () => {
		const t = view(
			[
				['f', 0, 0],
				['u', 0, 1],
				['m', 0, 2],
				['c', 1, 1]
			],
			[parent('f', 'c'), parent('m', 'c')]
		);
		expect(treeLines(t).families[0].starts).toEqual([centre(0), centre(2)]);
	});

	it('gives sibling families their own elbow height', () => {
		const t = view(
			[
				['a', 0, 0],
				['a2', 0, 1],
				['b', 0, 2],
				['b2', 0, 3],
				['x1', 1, 1],
				['x2', 1, 2],
				['y1', 1, 5]
			],
			[
				spouse('a', 'a2'),
				spouse('b', 'b2'),
				parent('a', 'x1'),
				parent('a2', 'x1'),
				parent('a', 'x2'),
				parent('a2', 'x2'),
				parent('b', 'y1'),
				parent('b2', 'y1')
			]
		);
		const families = treeLines(t).families;
		expect(families).toHaveLength(2);
		expect(families[0].elbow).not.toBe(families[1].elbow);
		for (const f of families) {
			expect(f.elbow).toBeGreaterThan(H);
			expect(f.elbow).toBeLessThan(ROW);
		}
	});

	it('routes a spouse line over the row when someone sits between', () => {
		const t = view(
			[
				['r', 0, 1],
				['s2', 0, 2],
				['s3', 0, 3],
				['s1', 0, 0]
			],
			[spouse('s1', 'r'), spouse('r', 's2'), spouse('r', 's3', true)]
		);
		const lines = treeLines(t).spouses;
		const of = (a: string, b: string) => lines.find((l) => l.key === `${a}-${b}`)!;
		expect(of('s1', 'r').y).toBe(H / 2);
		expect(of('r', 's3').y).toBeLessThan(0);
		expect(of('r', 's3').ended).toBe(true);
	});

	it('draws a marriage between spouses who landed on different rows', () => {
		const t = view(
			[
				['a', 0, 0],
				['b', 1, 2]
			],
			[spouse('a', 'b')]
		);
		const [line] = treeLines(t).spouses;
		expect(line.key).toBe('a-b');
		expect(line.d.startsWith(`M${centre(0)} ${H}`)).toBe(true);
		expect(line.d.endsWith(`V${ROW}`)).toBe(true);
	});
});

describe('relationsOf', () => {
	it('names parents, children and spouses, marking an ended marriage', () => {
		const t = view(
			[
				['r', 1, 0],
				['p', 0, 0],
				['s', 1, 1],
				['x', 1, 2],
				['c', 2, 0]
			],
			[parent('p', 'r'), spouse('r', 's'), spouse('r', 'x', true), parent('r', 'c')]
		);
		expect(relationsOf(t, 'r')).toEqual({
			parents: ['P'],
			children: ['C'],
			spouses: ['S'],
			formerSpouses: ['X']
		});
	});
});
