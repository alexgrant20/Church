import type { Cookies } from '@sveltejs/kit';

export type Theme = 'light' | 'dark' | 'system';

export const THEME_COOKIE = 'theme';

export function readTheme(cookies: Cookies): Theme {
	const value = cookies.get(THEME_COOKIE);
	return value === 'light' || value === 'dark' ? value : 'system';
}
