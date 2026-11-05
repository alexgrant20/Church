import { fail, redirect } from '@sveltejs/kit';
import { mapErrorToHttp, ValidationError } from '$lib/server/errors';
import { getHouseholdMember } from '$lib/server/modules/member/household-service';
import { recordPassedAway } from '$lib/server/modules/member/passed-away';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	try {
		return { person: await getHouseholdMember(params.id) };
	} catch (err) {
		mapErrorToHttp(err);
	}
};

export const actions: Actions = {
	default: async ({ params, request }) => {
		const deceasedOn = String((await request.formData()).get('deceasedOn') ?? '');
		try {
			await recordPassedAway(params.id, { deceasedOn });
		} catch (err) {
			if (err instanceof ValidationError) return fail(400, { error: err.message, deceasedOn });
			mapErrorToHttp(err);
		}
		redirect(303, '/profile/household?done=passed-away');
	}
};
