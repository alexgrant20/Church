import { sql } from 'drizzle-orm';
import { db } from '$lib/server/db/client';

export async function resetDb(): Promise<void> {
	const tables = await db.execute<{ name: string }>(
		sql`select quote_ident(tablename) as name from pg_tables where schemaname = 'public'`
	);
	if (tables.length === 0) return;
	await db.execute(
		sql.raw(`truncate ${tables.map((t) => `public.${t.name}`).join(', ')} restart identity cascade`)
	);
}
