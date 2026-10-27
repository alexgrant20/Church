import { db } from '$lib/server/db/client';
import * as repo from './repository';
import { createBranchSchema } from './schema';
import { recordAudit } from '$lib/server/modules/audit/service';
import { getContext } from '$lib/server/context';
import { getAccessibleBranchIds } from './access';
import { NotFoundError, ValidationError } from '$lib/server/errors';
import { toPage, type Cursor } from '$lib/server/pagination';

export async function createBranch(input: unknown) {
	const data = createBranchSchema.parse(input);
	const ctx = getContext();

	return db.transaction(async (tx) => {
		const branch = await repo.insertBranch(tx, data);
		await recordAudit(tx, {
			action: 'branch.create',
			entityType: 'branch',
			entityId: branch.id,
			branchId: branch.id,
			actorPersonId: ctx.personId,
			diff: { after: data }
		});
		return branch;
	});
}

export async function getBranch(id: string) {
	const branch = await repo.findBranchById(id);
	if (!branch) throw new NotFoundError('branch', id);
	return branch;
}

export async function listBranches() {
	return repo.listAccessibleBranches();
}

export async function searchBranches(input: { q: string; cursor: Cursor | null; limit: number }) {
	if (input.q.length > 100) throw new ValidationError('error_query_too_long');
	const accessible = getAccessibleBranchIds();
	if (accessible !== 'all' && accessible.length === 0) return { items: [], nextCursor: null };
	return toPage(
		await repo.searchBranches(input.q, input.cursor, input.limit),
		input.limit,
		(b) => b.name
	);
}
