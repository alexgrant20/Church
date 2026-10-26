import { describe, it, expect, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import { attachments, roleAssignments } from '$lib/server/db/schema';
import { resetDb } from '$lib/server/db/test/reset';
import { expectDbError } from '$lib/server/db/test/expect-db-error';
import { makeAttachment, makeBranch, makePerson } from '$lib/server/db/test/factories';

describe('schema rules', () => {
	beforeEach(resetDb);

	it('rejects a superadmin role with a branch', async () => {
		const [p, b] = [await makePerson(), await makeBranch()];
		await expectDbError(
			Promise.resolve(
				db.insert(roleAssignments).values({ personId: p.id, role: 'superadmin', branchId: b.id })
			),
			/check/
		);
	});
	it('rejects a group_admin role without a group', async () => {
		const p = await makePerson();
		await expectDbError(
			Promise.resolve(db.insert(roleAssignments).values({ personId: p.id, role: 'group_admin' })),
			/check/
		);
	});
	it('rejects the same superadmin role twice', async () => {
		const p = await makePerson();
		await db.insert(roleAssignments).values({ personId: p.id, role: 'superadmin' });
		await expectDbError(
			Promise.resolve(db.insert(roleAssignments).values({ personId: p.id, role: 'superadmin' })),
			/unique/
		);
	});
	it('allows one live profile photo per person, and a new one after soft delete', async () => {
		const p = await makePerson();
		const first = await makeAttachment({
			ownerType: 'person',
			ownerId: p.id,
			purpose: 'profile_photo'
		});
		await expectDbError(
			makeAttachment({
				ownerType: 'person',
				ownerId: p.id,
				purpose: 'profile_photo',
				position: 1
			}),
			/unique/
		);
		await db.update(attachments).set({ deletedAt: new Date() }).where(eq(attachments.id, first.id));
		await expect(
			makeAttachment({ ownerType: 'person', ownerId: p.id, purpose: 'profile_photo' })
		).resolves.toBeDefined();
	});
	it('allows many church photos per branch in order', async () => {
		const b = await makeBranch();
		await makeAttachment({
			ownerType: 'branch',
			ownerId: b.id,
			purpose: 'church_photo',
			position: 0
		});
		await expect(
			makeAttachment({ ownerType: 'branch', ownerId: b.id, purpose: 'church_photo', position: 1 })
		).resolves.toBeDefined();
	});
});
