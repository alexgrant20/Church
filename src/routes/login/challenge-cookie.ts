import type { Cookies } from '@sveltejs/kit';
import { config } from '$lib/server/config';

export const CHALLENGE_COOKIE = 'otp_challenge';

export const setChallengeCookie = (cookies: Cookies, token: string) =>
	cookies.set(CHALLENGE_COOKIE, token, {
		path: '/',
		httpOnly: true,
		secure: config.NODE_ENV === 'production',
		sameSite: 'lax',
		maxAge: 10 * 60
	});
