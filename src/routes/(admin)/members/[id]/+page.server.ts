import { mapErrorToHttp } from '$lib/server/errors';
import { getMember } from '$lib/server/modules/member/record-service';
import type { PageServerLoad } from './$types';

// Reads only the id: a load that read the URL would re-run, and re-audit a cross-branch view,
// on every tab switch. The page picks its tab from the URL itself.
export const load: PageServerLoad = async ({ params }) => {
	try {
		return { record: await getMember(params.id) };
	} catch (err) {
		mapErrorToHttp(err);
	}
};
