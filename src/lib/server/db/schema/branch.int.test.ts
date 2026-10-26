import { describe, it, expect, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import { branches } from '$lib/server/db/schema';
import { resetDb } from '$lib/server/db/test/reset';
import { expectDbError } from '$lib/server/db/test/expect-db-error';
import { makeBranch } from '$lib/server/db/test/factories';

describe('branches', () => {
	beforeEach(resetDb);

	it('rejects a duplicate live branch code', async () => {
		await makeBranch({ code: 'JKT' });
		await expectDbError(makeBranch({ code: 'JKT' }), /unique/);
	});
	it('allows reusing the code of a soft-deleted branch', async () => {
		const old = await makeBranch({ code: 'JKT' });
		await db.update(branches).set({ deletedAt: new Date() }).where(eq(branches.id, old.id));
		await expect(makeBranch({ code: 'JKT' })).resolves.toBeDefined();
	});
	it('gives new rows UUID v7 ids', async () => {
		const branch = await makeBranch();
		expect(branch.id[14]).toBe('7');
	});
});
