import type { Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { runWithContext } from '$lib/server/context';
import { validateSessionToken } from '$lib/server/modules/auth/service';
import { config } from '$lib/server/config';
import { paraglideMiddleware } from '$lib/paraglide/server';

const handleParaglide: Handle = ({ event, resolve }) =>
	paraglideMiddleware(event.request, ({ request, locale }) => {
		event.request = request;
		return resolve(event, {
			transformPageChunk: ({ html }) => html.replace('%paraglide.lang%', locale)
		});
	});

const handleSession: Handle = async ({ event, resolve }) => {
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

export const handle: Handle = sequence(handleParaglide, handleSession);
