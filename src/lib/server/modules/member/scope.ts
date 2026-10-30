import { ForbiddenError } from '$lib/server/errors';
import { scopeFor, type AccessibleBranches } from '$lib/server/modules/branch/access';

export const memberScope = (): AccessibleBranches =>
	scopeFor(['superadmin', 'branch_admin', 'pastor']);

// Export is its own permission: pastors read members but cannot take a list away.
export const exportScope = (): AccessibleBranches => scopeFor(['superadmin', 'branch_admin']);

function allowed(scope: () => AccessibleBranches): boolean {
	try {
		scope();
		return true;
	} catch (err) {
		if (err instanceof ForbiddenError) return false;
		throw err;
	}
}

export const canSeeMembers = () => allowed(memberScope);
export const canExportMembers = () => allowed(exportScope);
