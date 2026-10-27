import { ValidationError } from '$lib/server/errors';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

export type Cursor = { key: string; id: string };

export const encodeCursor = (key: string, id: string) =>
	Buffer.from(JSON.stringify({ key, id })).toString('base64url');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Accepts Postgres text ("2026-01-01 10:00:00.123456+00") and ISO forms.
export function isTimestampKey(key: string): boolean {
	if (!/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}(:?\d{2})?)$/.test(key)) {
		return false;
	}
	const iso = key.replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00');
	return !Number.isNaN(Date.parse(iso));
}

function decodeCursor(raw: string, validKey: (key: string) => boolean): Cursor {
	try {
		const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString());
		if (
			typeof parsed?.key === 'string' &&
			typeof parsed?.id === 'string' &&
			UUID.test(parsed.id) &&
			validKey(parsed.key)
		) {
			return { key: parsed.key, id: parsed.id };
		}
	} catch {
		// falls through to the validation error
	}
	throw new ValidationError('error_bad_cursor');
}

export function parsePage(
	url: URL,
	validKey: (key: string) => boolean = () => true
): { cursor: Cursor | null; limit: number } {
	const raw = Number.parseInt(url.searchParams.get('limit') ?? '', 10);
	const limit = Number.isNaN(raw) ? DEFAULT_LIMIT : Math.min(Math.max(raw, 1), MAX_LIMIT);
	const cursor = url.searchParams.get('cursor');
	return { cursor: cursor ? decodeCursor(cursor, validKey) : null, limit };
}

// Repositories fetch limit + 1 rows; the extra row only proves another page exists.
export function toPage<T extends { id: string }>(
	rows: T[],
	limit: number,
	keyOf: (row: T) => string
) {
	const items = rows.slice(0, limit);
	const last = items[items.length - 1];
	const nextCursor = rows.length > limit ? encodeCursor(keyOf(last), last.id) : null;
	return { items, nextCursor };
}
