import type { Actions, PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { resendLoginCode, verifyLogin } from '$lib/server/modules/auth/service';
import { config } from '$lib/server/config';
import { loginFailure } from '../errors';
import { CHALLENGE_COOKIE, setChallengeCookie } from '../challenge-cookie';

export const load: PageServerLoad = async ({ locals, cookies }) => {
	if (locals.person) throw redirect(303, '/');
	if (!cookies.get(CHALLENGE_COOKIE)) throw redirect(303, '/login');
};

export const actions: Actions = {
	verify: async ({ request, cookies, getClientAddress }) => {
		const challengeToken = cookies.get(CHALLENGE_COOKIE);
		if (!challengeToken) throw redirect(303, '/login');
		const code = String((await request.formData()).get('code') ?? '').trim();
		try {
			const { token, expiresAt } = await verifyLogin(
				{ challengeToken, code },
				{ ip: getClientAddress() }
			);
			cookies.delete(CHALLENGE_COOKIE, { path: '/' });
			cookies.set(config.SESSION_COOKIE_NAME, token, {
				path: '/',
				httpOnly: true,
				secure: config.NODE_ENV === 'production',
				sameSite: 'lax',
				expires: expiresAt
			});
		} catch (err) {
			return loginFailure(err);
		}
		throw redirect(303, '/');
	},
	resend: async ({ cookies }) => {
		const challengeToken = cookies.get(CHALLENGE_COOKIE);
		if (!challengeToken) throw redirect(303, '/login');
		try {
			setChallengeCookie(cookies, (await resendLoginCode(challengeToken)).challengeToken);
		} catch (err) {
			return loginFailure(err);
		}
	}
};
