import { inArray, sql, type Column } from 'drizzle-orm';
import { ForbiddenError } from '$lib/server/errors';
import { getContext, type RoleAssignment } from '$lib/server/context';

export type AccessibleBranches = 'all' | string[];

// Narrows the request's roles to those that grant one kind of access, so another role adds none.
export function scopeFor(roles: RoleAssignment['role'][]): AccessibleBranches {
	const ctx = getContext();
	const roleAssignments = ctx.roleAssignments.filter((r) => roles.includes(r.role));
	if (!roleAssignments.length) throw new ForbiddenError();
	return getAccessibleBranchIds({ ...ctx, roleAssignments });
}

export const branchInScope = (scope: AccessibleBranches, branchId: string) =>
	scope === 'all' || scope.includes(branchId);

export const columnInScope = (column: Column, scope: AccessibleBranches) =>
	scope === 'all' ? undefined : scope.length ? inArray(column, scope) : sql`false`;

export function getAccessibleBranchIds(ctx = getContext()): AccessibleBranches {
	if (ctx.roleAssignments.some((r) => r.role === 'superadmin')) return 'all';
	const ids = ctx.roleAssignments.map((r) => r.branchId).filter((id): id is string => id !== null);
	return [...new Set(ids)];
}
