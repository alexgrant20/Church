import { describe, it, expect, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { db } from '$lib/server/db/client';
import { resetDb } from '$lib/server/db/test/reset';
import { findAudits, recordAudit } from './service';

const write = (entityId: string, diff: unknown) =>
	db.transaction((tx) =>
		recordAudit(tx, {
			action: 'person.moved_out',
			entityType: 'person',
			entityId,
			branchId: null,
			diff
		})
	);

describe('findAudits', () => {
	beforeEach(resetDb);

	it('lists the rows for the entity and action, newest first', async () => {
		const id = randomUUID();
		await write(id, { n: 1 });
		await write(id, { n: 2 });
		const rows = await findAudits('person', id, 'person.moved_out');
		expect(rows.map((r) => r.diff)).toEqual([{ n: 2 }, { n: 1 }]);
	});

	it('lists nothing for another entity', async () => {
		await write(randomUUID(), { n: 1 });
		expect(await findAudits('person', randomUUID(), 'person.moved_out')).toEqual([]);
	});
});
