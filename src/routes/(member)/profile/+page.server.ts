import { canOpenMyHousehold } from '$lib/server/modules/member/household-service';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => ({ canOpenHousehold: await canOpenMyHousehold() });
