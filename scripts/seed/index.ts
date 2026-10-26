import { count } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../../src/lib/server/db/schema';
import { seedDevData } from './dev-data';
import { seedLocations } from './locations';

const client = postgres(process.env.DATABASE_URL!, { onnotice: () => {} });
const db = drizzle(client, { schema, casing: 'snake_case' });

try {
	const seededLocations = await seedLocations(db);
	const seededDev = await seedDevData(db);
	const [countries] = await db.select({ n: count() }).from(schema.countries);
	const [regions] = await db.select({ n: count() }).from(schema.regions);
	const [cities] = await db.select({ n: count() }).from(schema.cities);
	const [people] = await db.select({ n: count() }).from(schema.people);
	console.log(
		`locations ${seededLocations ? 'seeded' : 'already present'}: ` +
			`${countries.n} countries, ${regions.n} regions, ${cities.n} cities`
	);
	console.log(`dev data ${seededDev ? 'seeded' : 'already present'}: ${people.n} people`);
} finally {
	await client.end();
}
