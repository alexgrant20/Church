import { describe, it, expect, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { ZodError } from 'zod';
import { db } from '$lib/server/db/client';
import { auditLogs, systemSettings } from '$lib/server/db/schema';
import { runWithContext } from '$lib/server/context';
import { resetDb } from '$lib/server/db/test/reset';
import { makeBranch, makePerson } from '$lib/server/db/test/factories';
import { ForbiddenError } from '$lib/server/errors';
import { asStaff } from '$lib/server/modules/registration/test-support';
import { canEditSettings, getEditableSettings, getSetting, setSetting } from './service';

const KEY = 'membership.family_tree_enabled';
const changes = () => db.select().from(auditLogs).where(eq(auditLogs.action, 'setting.changed'));
const asSuperadmin = <T>(personId: string, fn: () => T) =>
	runWithContext(
		{
			personId,
			actingAsPersonId: null,
			ip: '127.0.0.1',
			roleAssignments: [{ role: 'superadmin', branchId: null, groupId: null }]
		},
		fn
	);

describe('settings', () => {
	beforeEach(resetDb);

	it('reads the default when no row exists', async () => {
		expect(await getSetting(KEY)).toBe(true);
	});

	it('reads a stored value', async () => {
		await db.insert(systemSettings).values({ key: KEY, value: false });
		expect(await getSetting(KEY)).toBe(false);
	});

	it('throws on a stored value of the wrong type', async () => {
		await db.insert(systemSettings).values({ key: KEY, value: 'no' });
		await expect(getSetting(KEY)).rejects.toBeInstanceOf(ZodError);
	});

	it('a superadmin change is stored and audited', async () => {
		const admin = await makePerson();
		await asSuperadmin(admin.id, () => setSetting(KEY, false));
		expect(await getSetting(KEY)).toBe(false);
		const [row] = await db.select().from(systemSettings).where(eq(systemSettings.key, KEY));
		expect(row.updatedByPersonId).toBe(admin.id);
		const audits = await changes();
		expect(audits).toHaveLength(1);
		expect(audits[0]).toMatchObject({
			entityType: 'system_setting',
			entityId: row.id,
			branchId: null,
			diff: { value: { before: true, after: false } }
		});
	});

	it('saving the same value writes no audit row', async () => {
		const admin = await makePerson();
		await asSuperadmin(admin.id, () => setSetting(KEY, true));
		expect(await changes()).toHaveLength(0);
	});

	it('a branch admin cannot change a setting', async () => {
		const branch = await makeBranch();
		await expect(asStaff('branch_admin', branch.id, () => setSetting(KEY, false))).rejects.toThrow(
			ForbiddenError
		);
		expect(await getSetting(KEY)).toBe(true);
	});

	it('only a superadmin can edit settings', async () => {
		const branch = await makeBranch();
		expect(asStaff('superadmin', null, canEditSettings)).toBe(true);
		expect(asStaff('branch_admin', branch.id, canEditSettings)).toBe(false);
		expect(asStaff('pastor', branch.id, canEditSettings)).toBe(false);
	});

	it('gives a superadmin the editable settings and refuses anyone else', async () => {
		const branch = await makeBranch();
		expect(await asStaff('superadmin', null, getEditableSettings)).toEqual({
			familyTreeEnabled: true
		});
		await expect(asStaff('branch_admin', branch.id, getEditableSettings)).rejects.toThrow(
			ForbiddenError
		);
	});
});
