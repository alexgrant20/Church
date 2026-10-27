import type { Actions, PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { login } from '$lib/server/modules/auth/service';
import { loginFailure } from './errors';
import { setChallengeCookie } from './challenge-cookie';

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.person) throw redirect(303, '/');
};

export const actions: Actions = {
	default: async ({ request, cookies, getClientAddress }) => {
		const formData = await request.formData();
		try {
			const { challengeToken } = await login(
				{ identifier: formData.get('identifier'), password: formData.get('password') },
				{ ip: getClientAddress() }
			);
			setChallengeCookie(cookies, challengeToken);
		} catch (err) {
			return loginFailure(err);
		}
		throw redirect(303, '/login/verify');
	}
};
