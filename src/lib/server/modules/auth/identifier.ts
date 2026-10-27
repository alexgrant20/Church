import { ValidationError } from '$lib/server/errors';

export type Identifier = { kind: 'email' | 'phone'; value: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^\+\d{8,15}$/;

export function normalizeIdentifier(raw: string): Identifier {
	const text = raw.trim();
	if (EMAIL.test(text)) return { kind: 'email', value: text.toLowerCase() };

	const digits = text.replace(/\D/g, '');
	const e164 = text.startsWith('+')
		? `+${digits}`
		: digits.startsWith('0')
			? `+62${digits.slice(1)}`
			: digits.startsWith('62')
				? `+${digits}`
				: '';
	if (!PHONE.test(e164)) throw new ValidationError('error_identifier_invalid');
	return { kind: 'phone', value: e164 };
}
