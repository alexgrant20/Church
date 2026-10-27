import { fail } from '@sveltejs/kit';
import { mapErrorToHttp, ValidationError } from '$lib/server/errors';
import { approveRegistration } from '$lib/server/modules/registration/approve';
import {
	markSpam,
	recordInPersonConsent,
	requestFix,
	sendConsentRequest
} from '$lib/server/modules/registration/decide';
import { getRegistration } from '$lib/server/modules/registration/review-service';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	try {
		return { registration: await getRegistration(params.id) };
	} catch (err) {
		mapErrorToHttp(err);
	}
};

// A validation error stays on the page as a message; anything else becomes an HTTP error.
async function run(action: () => Promise<unknown>) {
	try {
		await action();
		return { ok: true };
	} catch (err) {
		if (err instanceof ValidationError) return fail(400, { error: err.message });
		mapErrorToHttp(err);
	}
}

const field = async (request: Request, name: string) =>
	String((await request.formData()).get(name) ?? '');
// A missing or malformed index matches no person, so the service answers not found.
const index = (raw: string) => (/^\d{1,2}$/.test(raw) ? Number(raw) : -1);

export const actions: Actions = {
	approve: ({ params }) => run(() => approveRegistration(params.id)),
	fix: async ({ params, request }) => {
		const reason = await field(request, 'reason');
		return run(() => requestFix(params.id, reason));
	},
	spam: ({ params }) => run(() => markSpam(params.id)),
	consentInPerson: async ({ params, request }) => {
		const personIndex = index(await field(request, 'personIndex'));
		return run(() => recordInPersonConsent(params.id, personIndex));
	},
	consentRequest: async ({ params, request }) => {
		const data = await request.formData();
		const personIndex = index(String(data.get('personIndex') ?? ''));
		const memberId = String(data.get('memberId') ?? '');
		return run(() => sendConsentRequest(params.id, personIndex, memberId));
	}
};
