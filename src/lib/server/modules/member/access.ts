import { branchInScope, type AccessibleBranches } from '$lib/server/modules/branch/access';
import { householdBranchIds } from './record-repository';

type Target = { homeBranchId: string; householdId: string };

// Staff may read, never edit, anyone who shares a household with one of their branch's people.
export async function canViewPerson(
	target: Target,
	scope: AccessibleBranches
): Promise<'own' | 'cross' | null> {
	if (branchInScope(scope, target.homeBranchId)) return 'own';
	const rows = await householdBranchIds([target.householdId]);
	return rows.some((r) => branchInScope(scope, r.homeBranchId)) ? 'cross' : null;
}
