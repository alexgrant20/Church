import { db } from '$lib/server/db/client';
import { branches, cities, countries, regions } from '$lib/server/db/schema';

export type NewBranch = typeof branches.$inferInsert;

let counter = 0;
// Base-26 letters, so unique codes (iso2, branch code) never collide within a run.
const letters = (n: number, width: number) =>
	Array.from({ length: width }, (_, i) => String.fromCharCode(65 + (Math.floor(n / 26 ** i) % 26)))
		.reverse()
		.join('');

export async function makeCity() {
	const n = ++counter;
	const [country] = await db
		.insert(countries)
		.values({ iso2: letters(n, 2), name: `Country ${n}` })
		.returning();
	const [region] = await db
		.insert(regions)
		.values({ countryId: country.id, name: `Region ${n}` })
		.returning();
	const [city] = await db
		.insert(cities)
		.values({ regionId: region.id, name: `City ${n}` })
		.returning();
	return city;
}

export async function makeBranch(overrides: Partial<NewBranch> = {}) {
	const [branch] = await db
		.insert(branches)
		.values({
			code: `B${letters(++counter, 4)}`,
			name: 'Test Branch',
			addressLine: 'Jl. Test 1',
			cityId: overrides.cityId ?? (await makeCity()).id,
			timezone: 'Asia/Jakarta',
			...overrides
		})
		.returning();
	return branch;
}
