import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

// Own client, no $lib/server/config: the CLI and Vitest global setup run outside SvelteKit.
export async function runMigrations(url: string): Promise<void> {
	const client = postgres(url, { max: 1, onnotice: () => {} });
	try {
		await client`create extension if not exists pg_trgm`;
		await migrate(drizzle(client), { migrationsFolder: 'drizzle' });
	} finally {
		await client.end();
	}
}
