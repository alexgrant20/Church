import { ValidationError } from '$lib/server/errors';
import { parseContact, type Contact } from '$lib/registration/contact';

export type Identifier = Contact;

export function normalizeIdentifier(raw: string): Identifier {
	const parsed = parseContact(raw);
	if (!parsed) throw new ValidationError('error_identifier_invalid');
	return parsed;
}
