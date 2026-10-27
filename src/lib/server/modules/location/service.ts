import { ValidationError } from '$lib/server/errors';
import { toPage, type Cursor } from '$lib/server/pagination';
import * as repo from './repository';

const MAX_QUERY = 100;

export async function searchCities(input: { q: string; cursor: Cursor | null; limit: number }) {
	if (input.q.length > MAX_QUERY) throw new ValidationError('error_query_too_long');
	const rows = await repo.searchCities(input.q, input.cursor, input.limit);
	return toPage(rows, input.limit, (r) => r.name);
}
