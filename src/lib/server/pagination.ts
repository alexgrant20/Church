import { ValidationError } from '$lib/server/errors';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

export type Cursor = { key: string; id: string };

export const encodeCursor = (key: string, id: string) =>
	Buffer.from(JSON.stringify({ key, id })).toString('base64url');

function decodeCursor(raw: string): Cursor {
	try {
		const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString());
		if (typeof parsed?.key === 'string' && typeof parsed?.id === 'string') {
			return { key: parsed.key, id: parsed.id };
		}
	} catch {
		// falls through to the validation error
	}
	throw new ValidationError('error_bad_cursor');
}

export function parsePage(url: URL): { cursor: Cursor | null; limit: number } {
	const raw = Number.parseInt(url.searchParams.get('limit') ?? '', 10);
	const limit = Number.isNaN(raw) ? DEFAULT_LIMIT : Math.min(Math.max(raw, 1), MAX_LIMIT);
	const cursor = url.searchParams.get('cursor');
	return { cursor: cursor ? decodeCursor(cursor) : null, limit };
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
