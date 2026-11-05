import { describe, it, expect, beforeEach } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import { auditLogs, personRelationships, systemSettings } from '$lib/server/db/schema';
import { resetDb } from '$lib/server/db/test/reset';
import { makeBranch, makePerson } from '$lib/server/db/test/factories';
import { ForbiddenError, NotFoundError } from '$lib/server/errors';
import { asStaff } from '$lib/server/modules/registration/test-support';
import { familyOfBudi } from './test-family';
import { getFamilyTree, TREE_LIMIT } from './tree-service';

const asAdminOf = <T>(branchId: string, fn: () => T) => asStaff('branch_admin', branchId, fn);
const names = (t: Awaited<ReturnType<typeof getFamilyTree>>) =>
	t.nodes.map((n) => n.fullName).sort();

describe('family tree', () => {
	beforeEach(resetDb);

	it("returns Budi's connected family with layout slots", async () => {
		const f = await familyOfBudi();
		const tree = await asAdminOf(f.a.id, () => getFamilyTree(f.budi.id));
		expect(tree.rootId).toBe(f.budi.id);
		expect(tree.rootName).toBe('Budi');
		expect(tree.access).toBe('own');
		expect(tree.truncated).toBe(false);
		expect(names(tree)).toEqual(['Andi', 'Budi', 'Mother', 'Sari', 'Son']);
		const row = (name: string) => tree.nodes.find((n) => n.fullName === name)!.row;
		expect(row('Budi')).toBeGreaterThan(row('Mother'));
		expect(row('Budi')).toBeLessThan(row('Andi'));
	});

	it('a lone person gets a tree of one', async () => {
		const branch = await makeBranch();
		const p = await makePerson({ homeBranchId: branch.id });
		const tree = await asAdminOf(branch.id, () => getFamilyTree(p.id));
		expect(tree.nodes).toHaveLength(1);
		expect(tree.links).toEqual([]);
	});

	it('marks linkable by the cross-branch rule', async () => {
		const f = await familyOfBudi();
		const tree = await asAdminOf(f.a.id, () => getFamilyTree(f.budi.id));
		const node = (name: string) => tree.nodes.find((n) => n.fullName === name)!;
		expect(node('Son').linkable).toBe(false);
		expect(node('Sari').linkable).toBe(true);
	});

	it('marks ended spouse links', async () => {
		const f = await familyOfBudi();
		await db
			.update(personRelationships)
			.set({ endedOn: '2020-01-01' })
			.where(eq(personRelationships.kind, 'spouse'));
		const tree = await asAdminOf(f.a.id, () => getFamilyTree(f.budi.id));
		expect(tree.links.find((l) => l.kind === 'spouse')?.ended).toBe(true);
		expect(names(tree)).toContain('Sari');
	});

	it('a cross-branch tree is audited once', async () => {
		const f = await familyOfBudi();
		const tree = await asAdminOf(f.b.id, () => getFamilyTree(f.budi.id));
		expect(tree.access).toBe('cross');
		const audits = await db
			.select()
			.from(auditLogs)
			.where(
				and(eq(auditLogs.action, 'person.viewed_cross_branch'), eq(auditLogs.entityId, f.budi.id))
			);
		expect(audits).toHaveLength(1);
		expect(audits[0].branchId).toBe(f.a.id);
	});

	it('pastor may open it; group admin may not', async () => {
		const f = await familyOfBudi();
		await expect(asStaff('pastor', f.a.id, () => getFamilyTree(f.budi.id))).resolves.toBeTruthy();
		await expect(asStaff('group_admin', null, () => getFamilyTree(f.budi.id))).rejects.toThrow(
			ForbiddenError
		);
	});

	it('outside scope is 404', async () => {
		const f = await familyOfBudi();
		const c = await makeBranch();
		await expect(asAdminOf(c.id, () => getFamilyTree(f.budi.id))).rejects.toThrow(NotFoundError);
	});

	it('switched off is 404', async () => {
		const f = await familyOfBudi();
		await db.insert(systemSettings).values({ key: 'membership.family_tree_enabled', value: false });
		await expect(asStaff('superadmin', null, () => getFamilyTree(f.budi.id))).rejects.toThrow(
			NotFoundError
		);
	});

	it('caps at TREE_LIMIT', async () => {
		const branch = await makeBranch();
		const chain: { id: string }[] = [];
		for (let i = 0; i <= TREE_LIMIT; i++) chain.push(await makePerson({ homeBranchId: branch.id }));
		await db.insert(personRelationships).values(
			chain.slice(1).map((p, i) => ({
				kind: 'parent' as const,
				personId: chain[i].id,
				relatedPersonId: p.id
			}))
		);
		const tree = await asAdminOf(branch.id, () => getFamilyTree(chain[0].id));
		expect(tree.nodes).toHaveLength(TREE_LIMIT);
		expect(tree.truncated).toBe(true);
	});

	it('lists people in reading order, row by row then left to right', async () => {
		const f = await familyOfBudi();
		const tree = await asAdminOf(f.a.id, () => getFamilyTree(f.budi.id));
		const order = tree.nodes.map((n) => [n.row, n.col]);
		const sorted = [...order].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
		expect(order).toEqual(sorted);
	});
});
