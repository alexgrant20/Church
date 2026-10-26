import { describe, it, expect } from 'vitest';
import { createBranchSchema } from './schema';

const valid = {
	code: 'JKT',
	name: 'GRII Pusat',
	addressLine: 'Jl. Merdeka 1',
	cityId: '01a178ef-668e-7483-9aac-5cbf560c69b9',
	timezone: 'Asia/Jakarta'
};

describe('createBranchSchema', () => {
	it('accepts a valid branch payload', () => {
		expect(createBranchSchema.parse(valid).code).toBe('JKT');
	});

	it('rejects an empty name', () => {
		expect(() => createBranchSchema.parse({ ...valid, name: '' })).toThrow();
	});

	it('rejects a lowercase branch code', () => {
		expect(() => createBranchSchema.parse({ ...valid, code: 'jkt' })).toThrow();
	});

	it('rejects an unknown timezone', () => {
		expect(() => createBranchSchema.parse({ ...valid, timezone: 'Mars/Base' })).toThrow();
	});
});
