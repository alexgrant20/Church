import { m } from '$lib/paraglide/messages';

export type PersonErrors = Record<string, unknown>;

export function errorAt(errors: PersonErrors | undefined, path: string): string | undefined {
	const found = path
		.split('.')
		.reduce<unknown>((node, key) => (node as Record<string, unknown> | undefined)?.[key], errors);
	return Array.isArray(found) ? found[0] : undefined;
}

// zod messages are message keys; a library default that is not a key gets a generic prompt.
export function translateError(key: string): string {
	const message = (m as unknown as Record<string, (() => string) | undefined>)[key];
	return typeof message === 'function' ? message() : m.error_invalid();
}

export const errorsUnder = (errors: PersonErrors | undefined, key: string) =>
	errors?.[key] as PersonErrors | undefined;
