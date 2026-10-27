import { describe, it, expect } from 'vitest';
import { generateOtpCode } from './code';

describe('generateOtpCode', () => {
	it('always yields 6 digits', () => {
		for (let i = 0; i < 1000; i++) expect(generateOtpCode()).toMatch(/^\d{6}$/);
	});
});
