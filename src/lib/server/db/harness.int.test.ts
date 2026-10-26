import { describe, it, expect } from 'vitest';
import { sql } from 'drizzle-orm';
import { db } from '$lib/server/db/client';

describe('test database', () => {
	it('is the test database, not dev', async () => {
		const [row] = await db.execute<{ name: string }>(sql`select current_database() as name`);
		expect(row.name).toBe('churchapp_test');
	});

	it('has pg_trgm installed', async () => {
		const rows = await db.execute(sql`select 1 from pg_extension where extname = 'pg_trgm'`);
		expect(rows.length).toBe(1);
	});
});
