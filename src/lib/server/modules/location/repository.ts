import { and, asc, eq, ilike, sql } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import { cities, regions } from '$lib/server/db/schema';
import type { Cursor } from '$lib/server/pagination';

const escapeLike = (s: string) => s.replace(/[\\%_]/g, '\\$&');

export function searchCities(q: string, cursor: Cursor | null, limit: number) {
	return db
		.select({ id: cities.id, name: cities.name, region: regions.name })
		.from(cities)
		.innerJoin(regions, eq(regions.id, cities.regionId))
		.where(
			and(
				ilike(cities.name, `%${escapeLike(q.trim())}%`),
				cursor
					? sql`(${cities.name}, ${cities.id}) > (${cursor.key}, ${cursor.id}::uuid)`
					: undefined
			)
		)
		.orderBy(asc(cities.name), asc(cities.id))
		.limit(limit + 1);
}
