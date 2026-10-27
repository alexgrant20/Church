import type { Actions, PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { startActivation } from '$lib/server/modules/auth/activation';
import { setChallengeCookie } from '../login/challenge-cookie';
import { loginFailure } from '../login/errors';

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.person) throw redirect(303, '/');
};

export const actions: Actions = {
	default: async ({ request, cookies }) => {
		try {
			const identifier = String((await request.formData()).get('identifier') ?? '');
			setChallengeCookie(cookies, (await startActivation({ identifier })).challengeToken);
		} catch (err) {
			return loginFailure(err);
		}
		throw redirect(303, '/activate/verify');
	}
};
