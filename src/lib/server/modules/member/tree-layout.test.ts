import { describe, it, expect } from 'vitest';
import { layoutTree, type TreeLink } from './tree-layout';

const parent = (from: string, to: string): TreeLink => ({ kind: 'parent', from, to });
const spouse = (from: string, to: string): TreeLink => ({ kind: 'spouse', from, to });

describe('layoutTree', () => {
	it('puts the root alone at 0,0', () => {
		expect(layoutTree(['r'], [], 'r').get('r')).toEqual({ row: 0, col: 0 });
	});

	it('parents sit one row above, children one row below', () => {
		const slots = layoutTree(['p', 'r', 'c'], [parent('p', 'r'), parent('r', 'c')], 'r');
		expect([slots.get('p')?.row, slots.get('r')?.row, slots.get('c')?.row]).toEqual([0, 1, 2]);
	});

	it('spouses share a row and sit in adjacent columns', () => {
		const slots = layoutTree(['r', 's'], [spouse('r', 's')], 'r');
		const [r, s] = [slots.get('r')!, slots.get('s')!];
		expect(r.row).toBe(s.row);
		expect(Math.abs(r.col - s.col)).toBe(1);
	});

	it('children of two marriages sit under the right couple', () => {
		const slots = layoutTree(
			['s1', 'r', 's2', 'c1', 'c2'],
			[
				spouse('s1', 'r'),
				spouse('r', 's2'),
				parent('r', 'c1'),
				parent('s1', 'c1'),
				parent('r', 'c2'),
				parent('s2', 'c2')
			],
			's1'
		);
		const col = (id: string) => slots.get(id)!.col;
		expect(col('s1')).toBeLessThan(col('r'));
		expect(col('r')).toBeLessThan(col('s2'));
		expect(col('c1')).toBeLessThan(col('c2'));
	});

	it('no two people share a slot', () => {
		const ids = ['gp', 'gm', 'f', 'm', 'm2', 'u', 'ua', 'c1', 'c2', 'c3', 'k1', 'k2'];
		const links = [
			spouse('gp', 'gm'),
			parent('gp', 'f'),
			parent('gm', 'f'),
			parent('gp', 'u'),
			parent('gm', 'u'),
			spouse('f', 'm'),
			spouse('f', 'm2'),
			spouse('u', 'ua'),
			parent('f', 'c1'),
			parent('m', 'c1'),
			parent('f', 'c2'),
			parent('m2', 'c2'),
			parent('u', 'c3'),
			parent('ua', 'c3'),
			parent('c1', 'k1'),
			parent('c3', 'k2')
		];
		const slots = layoutTree(ids, links, 'c1');
		expect(slots.size).toBe(ids.length);
		const keys = [...slots.values()].map((s) => `${s.row}:${s.col}`);
		expect(new Set(keys).size).toBe(ids.length);
	});

	it('terminates on a cycle', () => {
		const slots = layoutTree(['a', 'b'], [parent('a', 'b'), parent('b', 'a')], 'a');
		expect(slots.size).toBe(2);
	});

	it('a contradictory link keeps the first row assigned', () => {
		const slots = layoutTree(['r', 'c'], [parent('r', 'c'), spouse('c', 'r')], 'r');
		expect(slots.get('c')!.row).toBe(slots.get('r')!.row + 1);
		expect(slots.size).toBe(2);
	});
});
