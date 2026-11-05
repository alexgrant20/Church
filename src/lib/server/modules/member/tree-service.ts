import { z } from 'zod';
import { db } from '$lib/server/db/client';
import { NotFoundError } from '$lib/server/errors';
import { recordAudit } from '$lib/server/modules/audit/service';
import { getSetting } from '$lib/server/modules/settings/service';
import { viewAccess } from './access';
import { findPersonDetail, householdBranchIds } from './record-repository';
import { memberScope } from './scope';
import { layoutTree, type TreeLink } from './tree-layout';
import * as repo from './tree-repository';

export const TREE_LIMIT = 200;

export type TreeNode = {
	id: string;
	fullName: string;
	memberCode: string | null;
	isMember: boolean;
	deceased: boolean;
	linkable: boolean;
	row: number;
	col: number;
};

// 404 for "switched off", "no such person" and "not yours" alike: the URL confirms nothing.
async function findRoot(id: string) {
	if (!z.uuid().safeParse(id).success) throw new NotFoundError('Person', id);
	if (!(await getSetting('membership.family_tree_enabled'))) throw new NotFoundError('Person', id);
	const scope = memberScope();
	const d = await findPersonDetail(id);
	if (!d) throw new NotFoundError('Person', id);
	const access = viewAccess(d.person, scope, await householdBranchIds([d.person.householdId]));
	if (!access) throw new NotFoundError('Person', id);
	if (access === 'cross') {
		await db.transaction((tx) =>
			recordAudit(tx, {
				action: 'person.viewed_cross_branch',
				entityType: 'person',
				entityId: id,
				branchId: d.person.homeBranchId
			})
		);
	}
	return { person: d.person, access, scope };
}

export async function getFamilyTree(id: string) {
	const { person, access, scope } = await findRoot(id);
	const found = await repo.connectedPersonIds(id, TREE_LIMIT + 1);
	const ids = found.slice(0, TREE_LIMIT);
	const [people, rows] = await Promise.all([repo.treePeople(ids), repo.treeLinks(ids)]);
	const households = await householdBranchIds([...new Set(people.map((p) => p.householdId))]);
	const links = rows.map((r) => ({
		kind: r.kind,
		from: r.personId,
		to: r.relatedPersonId,
		ended: r.endedOn !== null
	}));
	const slots = layoutTree(ids, links satisfies TreeLink[], id);
	const nodes: TreeNode[] = people.map((p) => ({
		id: p.id,
		fullName: p.fullName,
		memberCode: p.memberCode,
		isMember: p.isMember,
		deceased: p.deceasedOn !== null,
		linkable: viewAccess(p, scope, households) !== null,
		...slots.get(p.id)!
	}));
	return {
		rootId: id,
		rootName: person.fullName,
		access,
		truncated: found.length > TREE_LIMIT,
		nodes,
		links
	};
}

export type FamilyTree = Awaited<ReturnType<typeof getFamilyTree>>;
