import { mapErrorToHttp, runAction } from '$lib/server/errors';
import { recordMarriage, recordMarriageToMember } from '$lib/server/modules/member/married';
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
const address = (data: FormData) => ({
	line: text(data, 'line'),
	postalCode: text(data, 'postalCode'),
	cityId: text(data, 'cityId')
});

export const actions: Actions = {
	passedAway: async ({ params, request }) => {
		const data = await request.formData();
		return runAction(() => recordPassedAway(params.id, { deceasedOn: text(data, 'deceasedOn') }));
	},
	movedOut: async ({ params, request }) => {
		const data = await request.formData();
		return runAction(() => recordMovedOut(params.id, { address: address(data) }));
	},
	married: async ({ params, request }) => {
		const data = await request.formData();
		const spouse = {
			fullName: text(data, 'fullName'),
			nickname: text(data, 'nickname'),
			sex: text(data, 'sex'),
			birthDate: text(data, 'birthDate')
		};
		const input = { weddingOn: text(data, 'weddingOn'), spouse, address: address(data) };
		return runAction(() => recordMarriage(params.id, input));
	},
	marriedMember: async ({ params, request }) => {
		const data = await request.formData();
		const input = {
			weddingOn: text(data, 'weddingOn'),
			spouseId: text(data, 'spouseId'),
			address: address(data)
		};
		return runAction(() => recordMarriageToMember(params.id, input));
	},
	undoPassedAway: ({ params }) => runAction(() => undoPassedAway(params.id)),
	undoMovedOut: ({ params }) => runAction(() => undoMovedOut(params.id))
};
