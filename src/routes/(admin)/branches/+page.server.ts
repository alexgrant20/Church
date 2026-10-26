import type { PageServerLoad } from './$types';
import { listBranches } from '$lib/server/modules/branch/service';

export const load: PageServerLoad = async () => {
	return { branches: await listBranches() };
};
