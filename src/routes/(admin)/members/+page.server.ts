import { mapErrorToHttp } from '$lib/server/errors';
import { parseMemberFilters } from '$lib/server/modules/member/filters';
import { loadMemberList } from '$lib/server/modules/member/list-service';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
	try {
		const filters = parseMemberFilters(url);
		return { filters, ...(await loadMemberList(filters)) };
	} catch (err) {
		mapErrorToHttp(err);
	}
};
