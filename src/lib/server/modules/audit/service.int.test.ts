import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '$lib/server/db/client';
import { auditLogs } from '$lib/server/db/schema';
import { resetDb } from '$lib/server/db/test/reset';
import { recordAudits } from './service';

beforeEach(resetDb);

const input = (n: number) => ({
	action: 'test.created',
	entityType: 'thing',
	entityId: crypto.randomUUID(),
	branchId: null,
	diff: { n: { after: n } }
});

describe('recordAudits', () => {
	it('inserts every row of the batch', async () => {
		await db.transaction((tx) => recordAudits(tx, [input(1), input(2), input(3)]));
		const rows = await db.select().from(auditLogs);
		expect(rows).toHaveLength(3);
		expect(rows.map((r) => r.diff)).toEqual(
			expect.arrayContaining([{ n: { after: 1 } }, { n: { after: 3 } }])
		);
	});

	it('runs no query for an empty batch', async () => {
		await db.transaction((tx) => recordAudits(tx, []));
		expect(await db.select().from(auditLogs)).toHaveLength(0);
	});
});
