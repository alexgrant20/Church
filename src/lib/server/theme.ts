import type { Cookies } from '@sveltejs/kit';
import type { Theme } from '$lib/theme';

export const THEME_COOKIE = 'theme';

export function readTheme(cookies: Cookies): Theme {
	const value = cookies.get(THEME_COOKIE);
	return value === 'light' || value === 'dark' ? value : 'system';
}
