import { mapErrorToHttp } from '$lib/server/errors';
import { listRegistrations } from '$lib/server/modules/registration/review-service';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
	const status = url.searchParams.get('status') === 'needs_fix' ? 'needs_fix' : 'pending';
	try {
		return { status, first: await listRegistrations({ status, cursor: null, limit: 50 }) };
	} catch (err) {
		mapErrorToHttp(err);
	}
};
