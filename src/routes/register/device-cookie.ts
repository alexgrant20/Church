import { dev } from '$app/environment';
import type { Cookies } from '@sveltejs/kit';

const NAME = 'device_id';
const ONE_YEAR = 60 * 60 * 24 * 365;

// The rate limit counts per device; this cookie is the device.
export function ensureDeviceId(cookies: Cookies): string {
	const existing = cookies.get(NAME);
	if (existing) return existing;
	const id = crypto.randomUUID();
	cookies.set(NAME, id, {
		path: '/register',
		httpOnly: true,
		sameSite: 'lax',
		secure: !dev,
		maxAge: ONE_YEAR
	});
	return id;
}
