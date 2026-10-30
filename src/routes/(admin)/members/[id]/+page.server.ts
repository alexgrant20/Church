import { mapErrorToHttp } from '$lib/server/errors';
import { getMember } from '$lib/server/modules/member/record-service';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, url }) => {
	const tab = url.searchParams.get('tab') === 'family' ? 'family' : 'profile';
	try {
		return { tab, record: await getMember(params.id) };
	} catch (err) {
		mapErrorToHttp(err);
	}
};
