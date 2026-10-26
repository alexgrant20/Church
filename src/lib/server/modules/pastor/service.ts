import { db } from '$lib/server/db/client';
import * as repo from './repository';
import { assignPastorSchema } from './schema';
import { getBranch } from '$lib/server/modules/branch/service';
import { recordAudit } from '$lib/server/modules/audit/service';
import { getContext } from '$lib/server/context';
import { ValidationError } from '$lib/server/errors';

export async function assignPastor(input: unknown) {
	const data = assignPastorSchema.parse(input);
	const ctx = getContext();

	await getBranch(data.branchId); // throws NotFoundError if the branch doesn't exist

	if (await repo.findPastorAssignment(data.personId, data.branchId)) {
		throw new ValidationError('Person is already assigned as pastor for this branch');
	}

	return db.transaction(async (tx) => {
		const assignment = await repo.insertPastorAssignment(tx, data);
		await recordAudit(tx, {
			action: 'pastor.assign',
			entityType: 'role_assignment',
			entityId: assignment.id,
			branchId: data.branchId,
			actorPersonId: ctx.personId,
			diff: { after: data }
		});
		return assignment;
	});
}
