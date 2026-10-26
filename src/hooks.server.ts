import type { Handle } from '@sveltejs/kit';
import { runWithContext } from '$lib/server/context';
import { validateSessionToken } from '$lib/server/modules/auth/service';
import { config } from '$lib/server/config';

export const handle: Handle = async ({ event, resolve }) => {
	const token = event.cookies.get(config.SESSION_COOKIE_NAME);
	const { person, actingAsPersonId, roleAssignments } = token
		? await validateSessionToken(token)
		: { person: null, actingAsPersonId: null, roleAssignments: [] };

	event.locals.person = person;
	event.locals.actingAsPersonId = actingAsPersonId;
	event.locals.roleAssignments = roleAssignments;

	return runWithContext(
		{
			personId: person?.id ?? null,
			actingAsPersonId,
			roleAssignments,
			ip: event.getClientAddress()
		},
		() => resolve(event)
	);
};
