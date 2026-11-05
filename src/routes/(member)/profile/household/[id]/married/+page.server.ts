import { fail, redirect } from '@sveltejs/kit';
import { mapErrorToHttp, ValidationError } from '$lib/server/errors';
import { getHouseholdMember } from '$lib/server/modules/member/household-service';
import { recordMarriage } from '$lib/server/modules/member/married';
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
		const input = {
			weddingOn: text('weddingOn'),
			spouse: {
				fullName: text('fullName'),
				nickname: text('nickname'),
				sex: text('sex'),
				birthDate: text('birthDate')
			},
			address: { line: text('line'), postalCode: text('postalCode'), cityId: text('cityId') }
		};
		try {
			await recordMarriage(params.id, input);
		} catch (err) {
			if (err instanceof ValidationError) return fail(400, { error: err.message });
			mapErrorToHttp(err);
		}
		redirect(303, '/profile/household?done=married');
	}
};
