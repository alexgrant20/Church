import { describe, expect, it } from 'vitest';
import { firstPersonWithError, toErrors } from './form-errors';

describe('toErrors', () => {
	it('nests issues the way superforms does', () => {
		const errors = toErrors([
			{ path: ['people', 1, 'phone'], message: 'error_duplicate_in_form' },
			{ path: ['people'], message: 'error_too_many_people' }
		]);
		expect(errors).toEqual({
			people: { 1: { phone: ['error_duplicate_in_form'] }, _errors: ['error_too_many_people'] }
		});
	});

	it('returns null when there is nothing wrong', () => {
		expect(toErrors([])).toBeNull();
	});
});

describe('firstPersonWithError', () => {
	it('finds the lowest person index', () => {
		expect(firstPersonWithError({ people: { 3: {}, 1: {}, _errors: [] } })).toBe(1);
		expect(firstPersonWithError({ _errors: ['x'] })).toBeNull();
	});
});
