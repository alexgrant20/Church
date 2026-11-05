import { mapErrorToHttp } from '$lib/server/errors';
import { getFamilyTree } from '$lib/server/modules/member/tree-service';
import type { PageServerLoad } from './$types';

// Reads only the id, so nothing but a new person re-runs it and re-audits a cross-branch view.
export const load: PageServerLoad = async ({ params }) => {
	try {
		return { tree: await getFamilyTree(params.id) };
	} catch (err) {
		mapErrorToHttp(err);
	}
};
