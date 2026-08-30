import { describe, it, expect } from 'vitest';
import { createBranchSchema } from './schema';

describe('createBranchSchema', () => {
	it('accepts a valid branch payload', () => {
		expect(createBranchSchema.parse({ name: 'Downtown Branch', address: '123 Main St' }).name).toBe(
			'Downtown Branch'
		);
	});

	it('rejects an empty name', () => {
		expect(() => createBranchSchema.parse({ name: '' })).toThrow();
	});
});
