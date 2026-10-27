import { redirect } from '@sveltejs/kit';
import { logout } from '$lib/server/modules/auth/service';
import { config } from '$lib/server/config';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ cookies }) => {
	const token = cookies.get(config.SESSION_COOKIE_NAME);
	if (token) await logout(token);
	cookies.delete(config.SESSION_COOKIE_NAME, { path: '/' });
	throw redirect(303, '/login');
};
