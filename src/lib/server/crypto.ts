import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';
import { config } from '$lib/server/config';
import { ValidationError } from '$lib/server/errors';

const IV_LENGTH = 12;
const TAG_LENGTH = 16;

const encryptionKey = () => Buffer.from(config.NIK_ENCRYPTION_KEY, 'base64');

export function normalizeNik(input: string): string {
	const digits = input.replace(/\D/g, '');
	if (digits.length !== 16) throw new ValidationError('nik.invalid');
	return digits;
}

export function encryptNik(nik: string): Buffer {
	const iv = randomBytes(IV_LENGTH);
	const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
	const ciphertext = Buffer.concat([cipher.update(nik, 'utf8'), cipher.final()]);
	return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
}

export function decryptNik(data: Buffer): string {
	const iv = data.subarray(0, IV_LENGTH);
	const tag = data.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
	const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), iv);
	decipher.setAuthTag(tag);
	return Buffer.concat([
		decipher.update(data.subarray(IV_LENGTH + TAG_LENGTH)),
		decipher.final()
	]).toString('utf8');
}

export function maskNik(nik: string): string {
	return `${nik.slice(0, 4)}${'•'.repeat(8)}${nik.slice(-4)}`;
}

export function keyedHash(value: string): string {
	return createHmac('sha256', Buffer.from(config.HMAC_KEY, 'base64')).update(value).digest('hex');
}
