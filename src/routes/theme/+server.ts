import { error } from '@sveltejs/kit';
import { z } from 'zod';
import { THEME_COOKIE } from '$lib/server/theme';
import { themes } from '$lib/theme';
import type { RequestHandler } from './$types';

const bodySchema = z.object({ theme: z.enum(themes) });
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export const POST: RequestHandler = async ({ request, cookies }) => {
	const parsed = bodySchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) throw error(400);

	cookies.set(THEME_COOKIE, parsed.data.theme, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		maxAge: ONE_YEAR_SECONDS
	});
	return new Response(null, { status: 204 });
};
