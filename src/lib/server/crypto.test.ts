import { describe, it, expect, vi } from 'vitest';

vi.mock('$lib/server/config', () => ({
	config: {
		NIK_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64'),
		HMAC_KEY: Buffer.alloc(32, 2).toString('base64')
	}
}));

import { normalizeNik, encryptNik, decryptNik, maskNik, keyedHash } from './crypto';

describe('NIK crypto', () => {
	const nik = '3174012345670001';

	it('normalizes spaces and dashes to the same NIK', () => {
		expect(normalizeNik('3174 0123-4567 0001')).toBe(nik);
	});
	it('rejects a NIK that is not 16 digits', () => {
		expect(() => normalizeNik('31740123')).toThrow('nik.invalid');
	});
	it('round-trips through encryption', () => {
		expect(decryptNik(encryptNik(nik))).toBe(nik);
	});
	it('uses a fresh IV, so the same NIK encrypts differently', () => {
		expect(encryptNik(nik).equals(encryptNik(nik))).toBe(false);
	});
	it('fails to decrypt tampered data', () => {
		const data = encryptNik(nik);
		data[data.length - 1] ^= 1;
		expect(() => decryptNik(data)).toThrow();
	});
	it('masks all but the first and last 4 digits', () => {
		expect(maskNik(nik)).toBe('3174••••••••0001');
	});
	it('hashes the same NIK typed differently to the same value', () => {
		expect(keyedHash(normalizeNik('3174 0123 4567 0001'))).toBe(keyedHash(nik));
		expect(keyedHash(nik)).toMatch(/^[0-9a-f]{64}$/);
	});
});
