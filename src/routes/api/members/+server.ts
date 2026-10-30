import { json } from '@sveltejs/kit';
import { mapErrorToHttp } from '$lib/server/errors';
import { parsePage } from '$lib/server/pagination';
import { parseMemberFilters } from '$lib/server/modules/member/filters';
import { listMembers } from '$lib/server/modules/member/list-service';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	try {
		return json(await listMembers({ ...parseMemberFilters(url), ...parsePage(url) }));
	} catch (err) {
		mapErrorToHttp(err);
	}
};
