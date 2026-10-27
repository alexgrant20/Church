import { mapErrorToHttp } from '$lib/server/errors';
import { getRegistration } from '$lib/server/modules/registration/review-service';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	try {
		return { registration: await getRegistration(params.id) };
	} catch (err) {
		mapErrorToHttp(err);
	}
};
