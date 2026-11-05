import { mapErrorToHttp } from '$lib/server/errors';
import { getMyHousehold } from '$lib/server/modules/member/household-service';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	try {
		return await getMyHousehold();
	} catch (err) {
		mapErrorToHttp(err);
	}
};
