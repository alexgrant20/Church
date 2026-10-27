import { toPage, type Cursor } from '$lib/server/pagination';
import * as repo from './repository';

export async function searchCities(input: { q: string; cursor: Cursor | null; limit: number }) {
	const rows = await repo.searchCities(input.q, input.cursor, input.limit);
	return toPage(rows, input.limit, (r) => r.name);
}
