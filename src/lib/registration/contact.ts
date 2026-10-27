const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^\+\d{8,15}$/;

export type Contact = { kind: 'email' | 'phone'; value: string };

// Shared by the form and the server so both agree on what counts as the same contact.
export function parseContact(raw: string): Contact | null {
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
	return PHONE.test(e164) ? { kind: 'phone', value: e164 } : null;
}
