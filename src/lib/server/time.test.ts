import { describe, it, expect } from 'vitest';
import { ageOn, todayIn, yearIn } from './time';

describe('time helpers', () => {
	it('gives the Jakarta date when UTC is still the day before', () => {
		expect(todayIn('Asia/Jakarta', new Date('2026-12-31T17:30:00Z'))).toBe('2027-01-01');
		expect(yearIn('Asia/Jakarta', new Date('2026-12-31T17:30:00Z'))).toBe(2027);
	});

	it('counts the birthday itself as the new age', () => {
		expect(ageOn('2009-11-01', '2026-11-01')).toBe(17);
		expect(ageOn('2009-11-01', '2026-10-31')).toBe(16);
	});

	it('ages a 29 February birthday on 1 March in a non-leap year', () => {
		expect(ageOn('2008-02-29', '2025-02-28')).toBe(16);
		expect(ageOn('2008-02-29', '2025-03-01')).toBe(17);
	});
});
