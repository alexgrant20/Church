import type { Actions, PageServerLoad } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { login } from '$lib/server/modules/auth/service';
import { config } from '$lib/server/config';
import { ValidationError } from '$lib/server/errors';

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.person) throw redirect(303, '/');
};

export const actions: Actions = {
	default: async ({ request, cookies, getClientAddress }) => {
		const formData = await request.formData();
		const identifier = formData.get('identifier');
		const password = formData.get('password');

		try {
			const { token, expiresAt } = await login(
				{ identifier, password },
				{ ip: getClientAddress() }
			);

			cookies.set(config.SESSION_COOKIE_NAME, token, {
				path: '/',
				httpOnly: true,
				secure: config.NODE_ENV === 'production',
				sameSite: 'lax',
				expires: expiresAt
			});
		} catch (err) {
			if (err instanceof ValidationError) {
				return fail(400, { error: 'error_invalid_credentials' as const });
			}
			throw err;
		}

		throw redirect(303, '/');
	}
};
