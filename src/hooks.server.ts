import type { Handle } from '@sveltejs/kit';
import { runWithContext } from '$lib/server/context';
import { validateSessionToken } from '$lib/server/modules/auth/service';
import { config } from '$lib/server/config';

export const handle: Handle = async ({ event, resolve }) => {
	const token = event.cookies.get(config.SESSION_COOKIE_NAME);
	const { user, roleAssignments } = token
		? await validateSessionToken(token)
		: { user: null, roleAssignments: [] };

	event.locals.user = user;
	event.locals.roleAssignments = roleAssignments;

	return runWithContext(
		{ userId: user?.id ?? null, roleAssignments, ip: event.getClientAddress() },
		() => resolve(event)
	);
};
