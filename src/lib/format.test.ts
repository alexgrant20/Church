import { describe, it, expect } from 'vitest';
import { formatRupiah, formatCount, formatTime, formatMissing } from './format';

describe('formatters', () => {
	it('prints rupiah with dots and no decimals', () => {
		expect(formatRupiah(1250000).replace(/\s/g, ' ')).toBe('Rp 1.250.000');
	});
	it('prints rupiah the same whatever the UI locale', () => {
		expect(formatRupiah(1250000.4).replace(/\s/g, ' ')).toBe('Rp 1.250.000');
	});
	it('formats counts in the UI locale', () => {
		expect(formatCount(1284, 'en')).toBe('1,284');
		expect(formatCount(1284, 'id')).toBe('1.284');
	});
	it('prints 24-hour time in the branch time zone', () => {
		const d = new Date('2026-11-01T02:30:00Z');
		expect(formatTime(d, 'en', 'Asia/Jakarta')).toBe('09:30');
	});
	it('prints a dash for a missing value but keeps zero', () => {
		expect(formatMissing(null)).toBe('—');
		expect(formatMissing(0)).toBe('0');
	});
});
