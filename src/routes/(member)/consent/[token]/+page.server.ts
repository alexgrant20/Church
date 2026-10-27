import { fail, redirect } from '@sveltejs/kit';
import { mapErrorToHttp, ValidationError } from '$lib/server/errors';
import { decideConsent, loadConsent } from '$lib/server/modules/registration/consent';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	try {
		return { consent: await loadConsent(params.token) };
	} catch (err) {
		mapErrorToHttp(err);
	}
};

export const actions: Actions = {
	default: async ({ params, request }) => {
		const decision = String((await request.formData()).get('decision') ?? '');
		try {
			await decideConsent(params.token, decision);
		} catch (err) {
			if (err instanceof ValidationError) return fail(400, { error: err.message });
			mapErrorToHttp(err);
		}
		// The token is spent now, so reloading this page would be not found.
		redirect(303, decision === 'given' ? '/consent/thanks?given=1' : '/consent/thanks');
	}
};
