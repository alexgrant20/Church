import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

const STAFF_ROLES = new Set(['superadmin', 'pastor', 'branch_admin', 'group_admin']);

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw redirect(303, '/login');
	if (locals.roleAssignments.some((r) => STAFF_ROLES.has(r.role)))
		throw redirect(303, '/dashboard');
	throw redirect(303, '/profile');
};
