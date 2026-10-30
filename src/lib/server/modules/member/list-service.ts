import { ForbiddenError } from '$lib/server/errors';
import { branchInScope, type AccessibleBranches } from '$lib/server/modules/branch/access';
import { toPage, type Cursor } from '$lib/server/pagination';
import type { MemberFilters } from './filters';
import * as repo from './repository';
import { getBranch } from '$lib/server/modules/branch/service';
import { cityNames } from '$lib/server/modules/location/service';
import { canExportMembers, memberScope } from './scope';

export type MemberRow = Awaited<ReturnType<typeof repo.listMemberRows>>[number];

// A branch outside the caller's scope is refused, so the URL cannot widen what staff see.
export function checkedScope(filters: MemberFilters, scope: AccessibleBranches) {
	if (filters.branchId && !branchInScope(scope, filters.branchId)) throw new ForbiddenError();
	return scope;
}

export async function listMembers(
	input: MemberFilters & { cursor: Cursor | null; limit: number }
): Promise<{ items: MemberRow[]; nextCursor: string | null }> {
	const { cursor, limit, ...filters } = input;
	const scope = checkedScope(filters, memberScope());
	const rows = await repo.listMemberRows({ filters, scope, cursor, limit });
	return toPage(rows, limit, (r) => r.fullName);
}

export async function countMembers(filters: MemberFilters): Promise<number> {
	return repo.countMemberRows(filters, checkedScope(filters, memberScope()));
}

// Everything the list screen renders on first load, so the route makes one call.
export async function loadMemberList(filters: MemberFilters) {
	const isSuperadmin = memberScope() === 'all';
	const [first, total, cities, branch] = await Promise.all([
		listMembers({ ...filters, cursor: null, limit: 50 }),
		countMembers(filters),
		cityNames(filters.cityId ? [filters.cityId] : []),
		isSuperadmin && filters.branchId ? getBranch(filters.branchId).catch(() => null) : null
	]);
	return {
		first,
		total,
		names: { ...cities, ...(branch ? { [branch.id]: branch.name } : {}) },
		isSuperadmin,
		canExport: canExportMembers()
	};
}
