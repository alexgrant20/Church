import { redirect } from '@sveltejs/kit';
import { pendingBadge } from '$lib/server/modules/registration/review-service';
import type { LayoutServerLoad } from './$types';

const STAFF_ROLES = new Set(['superadmin', 'pastor', 'branch_admin', 'group_admin']);

export const load: LayoutServerLoad = async ({ locals }) => {
	if (!locals.person) throw redirect(303, '/login');
	if (!locals.roleAssignments.some((r) => STAFF_ROLES.has(r.role))) throw redirect(303, '/');
	return { person: locals.person, pendingCount: await pendingBadge() };
};
