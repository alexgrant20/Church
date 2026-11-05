import { describe, it, expect } from 'vitest';
import type { Link } from './family-relation';
import { childrenWhoGo } from './children-who-go';

const person = (id: string, adult: boolean, householdId = 'h1') => ({ id, adult, householdId });
const parent = (p: string, c: string): Link => ({
	kind: 'parent',
	personId: p,
	relatedPersonId: c,
	endedOn: null
});
const ids = (going: { child: { id: string }; parentId: string }[]) =>
	going.map((g) => [g.child.id, g.parentId]);

describe('children who go with the last adult', () => {
	it('the last adult out takes their own children under 17', () => {
		const people = [person('mum', true), person('kid', false), person('kid2', false)];
		const links = [parent('mum', 'kid'), parent('mum', 'kid2')];
		expect(ids(childrenWhoGo(people, ['mum'], links))).toEqual([
			['kid', 'mum'],
			['kid2', 'mum']
		]);
	});

	it('nobody goes while another adult stays', () => {
		const people = [person('mum', true), person('dad', true), person('kid', false)];
		expect(childrenWhoGo(people, ['mum'], [parent('mum', 'kid')])).toEqual([]);
	});

	it('a minor who is not a leaver’s child stays', () => {
		const people = [person('mum', true), person('niece', false)];
		expect(childrenWhoGo(people, ['mum'], [])).toEqual([]);
	});

	it('a grown child is not taken along', () => {
		const people = [person('mum', true), person('son', true)];
		expect(childrenWhoGo(people, ['mum', 'son'], [parent('mum', 'son')])).toEqual([]);
	});

	it('two leavers from two households each take their own children', () => {
		const people = [
			person('a', true, 'h1'),
			person('ka', false, 'h1'),
			person('b', true, 'h2'),
			person('kb', false, 'h2'),
			person('c', true, 'h2')
		];
		const links = [parent('a', 'ka'), parent('b', 'kb')];
		expect(ids(childrenWhoGo(people, ['a', 'b'], links))).toEqual([['ka', 'a']]);
	});

	it('a parent living elsewhere does not take a child along', () => {
		const people = [person('a', true, 'h1'), person('kb', false, 'h2')];
		expect(childrenWhoGo(people, ['a'], [parent('a', 'kb')])).toEqual([]);
	});
});
