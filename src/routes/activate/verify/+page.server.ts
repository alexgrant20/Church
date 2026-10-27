import type { Actions, PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { completeActivation, resendActivation } from '$lib/server/modules/auth/activation';
import { CHALLENGE_COOKIE, setChallengeCookie } from '../../login/challenge-cookie';
import { loginFailure } from '../../login/errors';

export const load: PageServerLoad = async ({ locals, cookies }) => {
	if (locals.person) throw redirect(303, '/');
	if (!cookies.get(CHALLENGE_COOKIE)) throw redirect(303, '/activate');
};

export const actions: Actions = {
	verify: async ({ request, cookies }) => {
		const challengeToken = cookies.get(CHALLENGE_COOKIE);
		if (!challengeToken) throw redirect(303, '/activate');
		const data = await request.formData();
		try {
			await completeActivation({
				challengeToken,
				code: String(data.get('code') ?? '').trim(),
				password: data.get('password')
			});
		} catch (err) {
			return loginFailure(err);
		}
		cookies.delete(CHALLENGE_COOKIE, { path: '/' });
		throw redirect(303, '/login?activated=1');
	},
	resend: async ({ cookies }) => {
		const challengeToken = cookies.get(CHALLENGE_COOKIE);
		if (!challengeToken) throw redirect(303, '/activate');
		setChallengeCookie(cookies, (await resendActivation(challengeToken)).challengeToken);
	}
};
