import { beforeEach, describe, expect, it } from 'vitest';
import { eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import { auditLogs, registrationLinks } from '$lib/server/db/schema';
import { resetDb } from '$lib/server/db/test/reset';
import { makeBranch, makePerson } from '$lib/server/db/test/factories';
import { runWithContext, type RoleAssignment } from '$lib/server/context';
import { ForbiddenError } from '$lib/server/errors';
import { getBranchLink, getLinkPage, resolveLink, rotateBranchLink } from './link-service';

const as = <T>(
	personId: string,
	role: RoleAssignment['role'],
	branchId: string | null,
	fn: () => T
) =>
	runWithContext(
		{
			personId,
			actingAsPersonId: null,
			ip: '127.0.0.1',
			roleAssignments: [{ role, branchId, groupId: null }]
		},
		fn
	);
const tokenOf = (url: string) => url.split('/register/')[1];
const liveLinks = (branchId: string) =>
	db.select().from(registrationLinks).where(eq(registrationLinks.branchId, branchId));

describe('branch registration link', () => {
	let branchId: string;
	let adminId: string;
	beforeEach(async () => {
		await resetDb();
		branchId = (await makeBranch()).id;
		adminId = (await makePerson({ homeBranchId: branchId })).id;
	});
	const admin = <T>(fn: () => T) => as(adminId, 'branch_admin', branchId, fn);

	it('creates one link per branch and returns the same one twice', async () => {
		const a = await admin(() => getBranchLink(branchId));
		const b = await admin(() => getBranchLink(branchId));
		expect(b.url).toBe(a.url);
		expect(a.qrSvg).toContain('<svg');
		expect(await liveLinks(branchId)).toHaveLength(1);
	});

	it('concurrent first reads leave one link', async () => {
		const [a, b] = await Promise.all([
			admin(() => getBranchLink(branchId)),
			admin(() => getBranchLink(branchId))
		]);
		expect(a.url).toBe(b.url);
		expect(await liveLinks(branchId)).toHaveLength(1);
	});

	it('rotates a seeded link that has no stored token', async () => {
		await db.insert(registrationLinks).values({
			tokenHash: 'a'.repeat(64),
			branchId,
			createdByPersonId: adminId
		});
		const { url } = await admin(() => getBranchLink(branchId));
		expect(await resolveLink(tokenOf(url))).not.toBeNull();
		const live = (await liveLinks(branchId)).filter((l) => !l.revokedAt);
		expect(live).toHaveLength(1);
	});

	it('rotating kills the old token at once', async () => {
		const old = tokenOf((await admin(() => getBranchLink(branchId))).url);
		const fresh = tokenOf((await admin(() => rotateBranchLink(branchId))).url);
		expect(await resolveLink(old)).toBeNull();
		expect(await resolveLink(fresh)).toMatchObject({ branchId });
		expect(await resolveLink('nope')).toBeNull();
	});

	it('concurrent rotations leave exactly one live link', async () => {
		await admin(() => getBranchLink(branchId));
		await Promise.all([
			admin(() => rotateBranchLink(branchId)),
			admin(() => rotateBranchLink(branchId))
		]);
		const live = await db
			.select()
			.from(registrationLinks)
			.where(eq(registrationLinks.branchId, branchId))
			.then((rows) => rows.filter((r) => !r.revokedAt));
		expect(live).toHaveLength(1);
	});

	it('a pastor cannot see or rotate the link', async () => {
		const pastor = <T>(fn: () => T) => as(adminId, 'pastor', branchId, fn);
		await expect(pastor(() => getBranchLink(branchId))).rejects.toThrow(ForbiddenError);
		await expect(pastor(() => rotateBranchLink(branchId))).rejects.toThrow(ForbiddenError);
		const other = (await makeBranch()).id;
		await expect(admin(() => getBranchLink(other))).rejects.toThrow(ForbiddenError);
	});

	it('superadmin may manage any branch', async () => {
		const { url } = await as(adminId, 'superadmin', null, () => getBranchLink(branchId));
		expect(url).toContain('/register/');
	});

	it('rotation writes one audit row without the token', async () => {
		await admin(() => getBranchLink(branchId));
		await db.delete(auditLogs);
		const { url } = await admin(() => rotateBranchLink(branchId));
		const rows = await db.select().from(auditLogs);
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({ action: 'registration_link.rotated', branchId });
		const [live] = await db
			.select()
			.from(registrationLinks)
			.where(isNull(registrationLinks.revokedAt));
		expect(JSON.stringify(rows[0])).not.toContain(tokenOf(url));
		expect(JSON.stringify(rows[0])).not.toContain(live.tokenHash);
	});

	it('opens a branch admin on their own branch', async () => {
		const page = await admin(() => getLinkPage(null));
		expect(page.branch?.id).toBe(branchId);
		expect(page.link?.url).toContain('/register/');
	});

	it('waits for a superadmin to choose a branch before touching any link', async () => {
		const page = await as(adminId, 'superadmin', null, () => getLinkPage(null));
		expect(page).toEqual({ canChooseBranch: true, branch: null, link: null });
		expect(await liveLinks(branchId)).toHaveLength(0);
	});

	it('rejects a branch id that is not a uuid', async () => {
		await expect(as(adminId, 'superadmin', null, () => getLinkPage('nope'))).rejects.toThrow(
			'error_bad_branch'
		);
	});
});
