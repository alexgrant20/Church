import { describe, expect, it } from 'vitest';
import type { RegistrationInput } from '$lib/registration/schema';
import { deriveRelationships } from './relationships';

const p = (relation: string, notChildOfSpouse?: boolean) =>
	({ relation, notChildOfSpouse }) as unknown as RegistrationInput['people'][number];
const derive = (people: ReturnType<typeof p>[], married = true) =>
	deriveRelationships(people, married);

describe('deriveRelationships', () => {
	it('links the spouse to self', () => {
		expect(derive([p('self'), p('spouse')])).toEqual([{ kind: 'spouse', from: 0, to: 1 }]);
	});

	it('makes self and spouse parents of each child', () => {
		expect(derive([p('self'), p('spouse'), p('child')])).toEqual([
			{ kind: 'spouse', from: 0, to: 1 },
			{ kind: 'parent', from: 0, to: 2 },
			{ kind: 'parent', from: 1, to: 2 }
		]);
	});

	it('step-child is not the spouse child', () => {
		const rows = derive([p('self'), p('spouse'), p('child', true)]);
		expect(rows).toContainEqual({ kind: 'parent', from: 0, to: 2 });
		expect(rows).not.toContainEqual({ kind: 'parent', from: 1, to: 2 });
	});

	it('makes each parent the parent of self and of each sibling', () => {
		const rows = derive([p('self'), p('parent'), p('sibling')]);
		expect(rows).toEqual([
			{ kind: 'parent', from: 1, to: 0 },
			{ kind: 'parent', from: 1, to: 2 }
		]);
	});

	it('marries two parents only when parentsMarried', () => {
		const people = [p('self'), p('parent'), p('parent')];
		expect(derive(people)).toContainEqual({ kind: 'spouse', from: 1, to: 2 });
		expect(derive(people, false).filter((r) => r.kind === 'spouse')).toEqual([]);
	});

	it('sibling without parents on the form gets no row', () => {
		expect(derive([p('self'), p('sibling')])).toEqual([]);
	});
});
