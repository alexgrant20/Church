import { describe, it, expect, beforeEach } from 'vitest';
import { ilike } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import { people, personRelationships } from '$lib/server/db/schema';
import { resetDb } from '$lib/server/db/test/reset';
import { expectDbError } from '$lib/server/db/test/expect-db-error';
import { makeBranch, makePerson } from '$lib/server/db/test/factories';
import { keyedHash } from '$lib/server/crypto';
import { nextMemberCode } from './member-code';

describe('people', () => {
	beforeEach(resetDb);

	it('numbers Member IDs per branch and year', async () => {
		const branch = await makeBranch({ code: 'JKT' });
		const codes = await db.transaction(async (tx) => [
			await nextMemberCode(tx, branch, 2026),
			await nextMemberCode(tx, branch, 2026)
		]);
		expect(codes).toEqual(['JKT-2026-00001', 'JKT-2026-00002']);
	});
	it('never hands out the same Member ID to concurrent registrations', async () => {
		const branch = await makeBranch();
		const codes = await Promise.all(
			Array.from({ length: 10 }, () => db.transaction((tx) => nextMemberCode(tx, branch, 2026)))
		);
		expect(new Set(codes).size).toBe(10);
	});
	it('rejects a second live person with the same NIK hash', async () => {
		const nikHash = keyedHash('3174012345670001');
		await makePerson({ nikHash });
		await expectDbError(makePerson({ nikHash }), /unique/);
	});
	it('allows many people without a NIK', async () => {
		await makePerson({ nikHash: null });
		await expect(makePerson({ nikHash: null })).resolves.toBeDefined();
	});
	it('rejects a relationship of a person to themselves', async () => {
		const p = await makePerson();
		await expectDbError(
			Promise.resolve(
				db
					.insert(personRelationships)
					.values({ kind: 'parent', personId: p.id, relatedPersonId: p.id })
			),
			/check/
		);
	});
	it('stores a couple once, lower id first', async () => {
		const [a, b] = [await makePerson(), await makePerson()].sort((x, y) => (x.id < y.id ? -1 : 1));
		await expectDbError(
			Promise.resolve(
				db
					.insert(personRelationships)
					.values({ kind: 'spouse', personId: b.id, relatedPersonId: a.id })
			),
			/check/
		);
	});
	it('finds a person by part of their Chinese name', async () => {
		await makePerson({ chineseName: '王美玲' });
		const rows = await db.select().from(people).where(ilike(people.chineseName, '%美玲%'));
		expect(rows).toHaveLength(1);
	});
});
