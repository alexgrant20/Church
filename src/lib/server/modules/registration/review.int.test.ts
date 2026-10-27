import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '$lib/server/db/client';
import { registrationConsents, registrations } from '$lib/server/db/schema';
import { resetDb } from '$lib/server/db/test/reset';
import type { NewRegistration } from '$lib/server/db/test/factories';
import {
	makeBranch,
	makePerson,
	makeRegistration,
	makeRegistrationLink
} from '$lib/server/db/test/factories';
import { runWithContext, type RoleAssignment } from '$lib/server/context';
import { encryptNik } from '$lib/server/crypto';
import { ForbiddenError, NotFoundError } from '$lib/server/errors';
import {
	countPendingRegistrations,
	getRegistration,
	listRegistrations,
	pendingBadge
} from './review-service';

const as = <T>(role: RoleAssignment['role'], branchId: string | null, fn: () => T) =>
	runWithContext(
		{
			personId: null,
			actingAsPersonId: null,
			ip: '127.0.0.1',
			roleAssignments: [{ role, branchId, groupId: null }]
		},
		fn
	);
const NIK = '3174012345670001';
const payload = (...names: string[]) => ({
	people: names.map((fullName, i) => ({
		relation: i ? 'child' : 'self',
		fullName,
		birthDate: '1990-05-01',
		nikEncrypted: encryptNik(NIK).toString('base64'),
		nikHash: 'a'.repeat(64)
	}))
});
const list = (branchId: string, limit = 50, cursor: { key: string; id: string } | null = null) =>
	as('branch_admin', branchId, () => listRegistrations({ status: 'pending', cursor, limit }));
const detail = (branchId: string, id: string) =>
	as('branch_admin', branchId, () => getRegistration(id));

describe('review queue', () => {
	let branchId: string;
	let linkId: string;
	const reg = (o: Partial<NewRegistration>) =>
		makeRegistration({ branchId, registrationLinkId: linkId, ...o });
	beforeEach(async () => {
		await resetDb();
		branchId = (await makeBranch()).id;
		linkId = (await makeRegistrationLink({ branchId })).id;
	});

	it("lists only my branch's pending registrations, oldest first", async () => {
		const other = await makeBranch();
		await reg({
			payload: payload('Newer'),
			submittedAt: new Date('2026-02-01')
		});
		await reg({
			payload: payload('Older', 'Kid'),
			submittedAt: new Date('2026-01-01')
		});
		await reg({ payload: payload('Fixing'), status: 'needs_fix' });
		await makeRegistration({ branchId: other.id, payload: payload('Elsewhere') });
		const { items } = await list(branchId);
		expect(items.map((r) => r.registrantName)).toEqual(['Older', 'Newer']);
		expect(items[0].peopleCount).toBe(2);
		const all = await as('superadmin', null, () =>
			listRegistrations({ status: 'pending', cursor: null, limit: 50 })
		);
		expect(all.items).toHaveLength(3);
		expect(await as('branch_admin', branchId, () => countPendingRegistrations())).toBe(2);
	});

	it('pages with a cursor', async () => {
		await db.insert(registrations).values(
			Array.from({ length: 51 }, (_, i) => ({
				registrationLinkId: linkId,
				branchId,
				payload: payload(`P${i}`),
				locale: 'id',
				contactEmail: 'a@mail.test'
			}))
		);
		const first = await list(branchId);
		expect(first.items).toHaveLength(50);
		const key = JSON.parse(Buffer.from(first.nextCursor!, 'base64url').toString());
		const second = await list(branchId, 50, key);
		expect(second.items).toHaveLength(1);
		expect(second.nextCursor).toBeNull();
		expect(new Set([...first.items, ...second.items].map((r) => r.id)).size).toBe(51);
	});

	it('shows a name-and-birth-date warning', async () => {
		await makePerson({ homeBranchId: branchId, fullName: 'Budi Santoso', birthDate: '1990-05-01' });
		await makePerson({ homeBranchId: branchId, fullName: 'Budi Santoso', birthDate: '1991-01-01' });
		await makePerson({
			homeBranchId: branchId,
			fullName: 'Budi Santoso',
			birthDate: '1990-05-01',
			deletedAt: new Date()
		});
		const r = await reg({
			payload: payload(' budi SANTOSO ', 'Someone Else')
		});
		const { people } = await detail(branchId, r.id);
		expect(people[0].warnings.map((w) => w.fullName)).toEqual(['Budi Santoso']);
		expect(people[1].warnings).toEqual([]);
	});

	it('hides members of other branches behind a flag', async () => {
		const other = await makeBranch();
		await makePerson({ homeBranchId: branchId, fullName: 'Same Name', birthDate: '1990-05-01' });
		const secret = await makePerson({
			homeBranchId: other.id,
			fullName: 'Hidden Person',
			birthDate: '1990-05-01'
		});
		const r = await reg({ payload: payload('Same Name', 'Hidden Person') });
		const d = await detail(branchId, r.id);
		expect(d.people[0].warnings).toHaveLength(1);
		expect(d.people[0].warnings[0].memberCode).toMatch(/^T-/);
		expect(d.people[0].otherBranchMatch).toBe(false);
		expect(d.people[1].warnings).toEqual([]);
		expect(d.people[1].otherBranchMatch).toBe(true);
		const json = JSON.stringify(d);
		expect(json).not.toContain(secret.memberCode!);
		expect(json).not.toContain(secret.id);
		const all = await as('superadmin', null, () => getRegistration(r.id));
		expect(all.people[1].warnings).toHaveLength(1);
		expect(all.people[1].otherBranchMatch).toBe(false);
	});

	it("does not show another branch's registration", async () => {
		const other = await makeBranch();
		const r = await makeRegistration({ branchId: other.id, payload: payload('Elsewhere') });
		await expect(detail(branchId, r.id)).rejects.toBeInstanceOf(NotFoundError);
	});

	it('masks NIK', async () => {
		const r = await reg({ payload: payload('Budi') });
		const d = await detail(branchId, r.id);
		const p = d.people[0] as Record<string, unknown>;
		expect(p.nikMasked).toBe('3174••••••••0001');
		expect(p.nikEncrypted).toBeUndefined();
		expect(p.nikHash).toBeUndefined();
		expect(JSON.stringify(d)).not.toContain(NIK);
	});

	it('counts waiting consents', async () => {
		const member = await makePerson({ homeBranchId: branchId });
		const r = await reg({ payload: payload('A', 'B', 'C') });
		await db.insert(registrationConsents).values([
			{
				registrationId: r.id,
				personIndex: 0,
				matchedPersonId: member.id,
				tokenHash: 't'.repeat(64)
			},
			{ registrationId: r.id, personIndex: 1, matchedPersonId: member.id },
			{
				registrationId: r.id,
				personIndex: 2,
				matchedPersonId: member.id,
				tokenHash: 'u'.repeat(64),
				decision: 'given'
			}
		]);
		const { items } = await list(branchId);
		expect(items[0].waitingConsents).toBe(2);
		const d = await detail(branchId, r.id);
		expect(d.people.map((p) => p.consent)).toEqual(['waiting', 'in_person_needed', 'given']);
	});

	it('a pastor is forbidden', async () => {
		const r = await reg({ payload: payload('A') });
		const pastor = <T>(fn: () => T) => as('pastor', branchId, fn);
		await expect(
			pastor(() => listRegistrations({ status: 'pending', cursor: null, limit: 5 }))
		).rejects.toBeInstanceOf(ForbiddenError);
		await expect(pastor(() => getRegistration(r.id))).rejects.toBeInstanceOf(ForbiddenError);
		await expect(pastor(() => countPendingRegistrations())).rejects.toBeInstanceOf(ForbiddenError);
	});

	it('gives the nav badge to reviewers only', async () => {
		await reg({ payload: payload('A') });
		expect(await as('branch_admin', branchId, () => pendingBadge())).toBe(1);
		expect(await as('pastor', branchId, () => pendingBadge())).toBeNull();
	});

	it('tells when a registration was submitted', async () => {
		const submittedAt = new Date('2026-03-04T05:06:07Z');
		const r = await reg({ payload: payload('A'), submittedAt });
		expect((await detail(branchId, r.id)).submittedAt).toEqual(submittedAt);
	});

	it('treats a malformed id as not found', async () => {
		await expect(detail(branchId, 'not-a-uuid')).rejects.toBeInstanceOf(NotFoundError);
	});
});
