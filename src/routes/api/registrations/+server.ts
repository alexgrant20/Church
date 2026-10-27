import { json } from '@sveltejs/kit';
import { mapErrorToHttp, ValidationError } from '$lib/server/errors';
import { isTimestampKey, parsePage } from '$lib/server/pagination';
import { listRegistrations } from '$lib/server/modules/registration/review-service';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	try {
		const status = url.searchParams.get('status');
		if (status !== 'pending' && status !== 'needs_fix') {
			throw new ValidationError('error_bad_status');
		}
		return json(await listRegistrations({ status, ...parsePage(url, isTimestampKey) }));
	} catch (err) {
		mapErrorToHttp(err);
	}
};
