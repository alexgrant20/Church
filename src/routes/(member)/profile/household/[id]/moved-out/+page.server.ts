import { fail, redirect } from '@sveltejs/kit';
import { mapErrorToHttp, ValidationError } from '$lib/server/errors';
import { getHouseholdMember } from '$lib/server/modules/member/household-service';
import { recordMovedOut } from '$lib/server/modules/member/moved-out';
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
		const data = await request.formData();
		const text = (name: string) => String(data.get(name) ?? '');
		const address = { line: text('line'), postalCode: text('postalCode'), cityId: text('cityId') };
		try {
			await recordMovedOut(params.id, { address });
		} catch (err) {
			if (err instanceof ValidationError) return fail(400, { error: err.message });
			mapErrorToHttp(err);
		}
		redirect(303, '/profile/household?done=moved-out');
	}
};
