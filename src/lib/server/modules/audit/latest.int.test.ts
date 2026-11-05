import { describe, it, expect, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { db } from '$lib/server/db/client';
import { resetDb } from '$lib/server/db/test/reset';
import { findLatestAudit, recordAudit } from './service';

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

describe('findLatestAudit', () => {
	beforeEach(resetDb);

	it('returns the newest row for the action and entity', async () => {
		const id = randomUUID();
		await write(id, { n: 1 });
		await write(id, { n: 2 });
		expect((await findLatestAudit('person.moved_out', id))?.diff).toEqual({ n: 2 });
	});

	it('returns undefined for another entity', async () => {
		await write(randomUUID(), { n: 1 });
		expect(await findLatestAudit('person.moved_out', randomUUID())).toBeUndefined();
	});
});
