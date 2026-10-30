import { branchInScope, type AccessibleBranches } from '$lib/server/modules/branch/access';
import { householdBranchIds } from './record-repository';

type Target = { homeBranchId: string; householdId: string };
export type HouseholdBranch = { householdId: string; homeBranchId: string };
export type ViewAccess = 'own' | 'cross' | null;

// Staff may read, never edit, anyone who shares a household with one of their branch's people.
export function viewAccess(
	target: Target,
	scope: AccessibleBranches,
	households: HouseholdBranch[]
): ViewAccess {
	if (branchInScope(scope, target.homeBranchId)) return 'own';
	const shared = households.some(
		(h) => h.householdId === target.householdId && branchInScope(scope, h.homeBranchId)
	);
	return shared ? 'cross' : null;
}

export async function canViewPerson(target: Target, scope: AccessibleBranches) {
	return viewAccess(target, scope, await householdBranchIds([target.householdId]));
}
