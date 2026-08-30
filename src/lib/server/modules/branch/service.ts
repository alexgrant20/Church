import { db } from '$lib/server/db/client';
import * as repo from './repository';
import { createBranchSchema } from './schema';
import { recordAudit } from '$lib/server/modules/audit/service';
import { getContext } from '$lib/server/context';
import { NotFoundError } from '$lib/server/errors';

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
			actorUserId: ctx.userId,
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
