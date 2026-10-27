import { mapErrorToHttp } from '$lib/server/errors';
import { getLinkPage, rotateBranchLink } from '$lib/server/modules/registration/link-service';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
	try {
		return await getLinkPage(url.searchParams.get('branch'));
	} catch (err) {
		mapErrorToHttp(err);
	}
};

export const actions: Actions = {
	rotate: async ({ request }) => {
		try {
			await rotateBranchLink(String((await request.formData()).get('branchId') ?? ''));
		} catch (err) {
			mapErrorToHttp(err);
		}
		return { rotated: true };
	}
};
