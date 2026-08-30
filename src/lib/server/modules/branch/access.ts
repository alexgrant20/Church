import { getContext } from '$lib/server/context';

export type AccessibleBranches = 'all' | string[];

export function getAccessibleBranchIds(ctx = getContext()): AccessibleBranches {
	if (ctx.roleAssignments.some((r) => r.role === 'superadmin')) return 'all';
	const ids = ctx.roleAssignments.map((r) => r.branchId).filter((id): id is string => id !== null);
	return [...new Set(ids)];
}
