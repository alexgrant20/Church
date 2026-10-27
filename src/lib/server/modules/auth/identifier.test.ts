import { describe, it, expect } from 'vitest';
import { normalizeIdentifier } from './identifier';

describe('normalizeIdentifier', () => {
	it.each(['0812 3456 7890', '+62 812-3456-7890', '6281234567890'])('normalizes %s', (raw) => {
		expect(normalizeIdentifier(raw)).toEqual({ kind: 'phone', value: '+6281234567890' });
	});
	it('keeps other E.164 numbers', () => {
		expect(normalizeIdentifier('+65 9123 4567')).toEqual({ kind: 'phone', value: '+6591234567' });
	});
	it('lowercases email', () => {
		expect(normalizeIdentifier(' Budi@GRII.test ')).toEqual({
			kind: 'email',
			value: 'budi@grii.test'
		});
	});
	it('rejects text that is neither', () => {
		expect(() => normalizeIdentifier('budi')).toThrow('error_identifier_invalid');
	});
});
