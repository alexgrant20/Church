import { mapErrorToHttp, runAction } from '$lib/server/errors';
import { recordMovedOut, undoMovedOut } from '$lib/server/modules/member/moved-out';
import { recordPassedAway, undoPassedAway } from '$lib/server/modules/member/passed-away';
import { getMember } from '$lib/server/modules/member/record-service';
import type { Actions, PageServerLoad } from './$types';

// Reads only the id: a load that read the URL would re-run, and re-audit a cross-branch view,
// on every tab switch. The page picks its tab from the URL itself.
export const load: PageServerLoad = async ({ params }) => {
	try {
		return { record: await getMember(params.id) };
	} catch (err) {
		mapErrorToHttp(err);
	}
};

const text = (data: FormData, name: string) => String(data.get(name) ?? '');

export const actions: Actions = {
	passedAway: async ({ params, request }) => {
		const data = await request.formData();
		return runAction(() => recordPassedAway(params.id, { deceasedOn: text(data, 'deceasedOn') }));
	},
	movedOut: async ({ params, request }) => {
		const data = await request.formData();
		const address = {
			line: text(data, 'line'),
			postalCode: text(data, 'postalCode'),
			cityId: text(data, 'cityId')
		};
		return runAction(() => recordMovedOut(params.id, { address }));
	},
	undoPassedAway: ({ params }) => runAction(() => undoPassedAway(params.id)),
	undoMovedOut: ({ params }) => runAction(() => undoMovedOut(params.id))
};
