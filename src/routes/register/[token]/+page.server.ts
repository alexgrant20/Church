import { error, fail, redirect } from '@sveltejs/kit';
import { message, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { registrationSchema } from '$lib/registration/schema';
import { getLocale } from '$lib/paraglide/runtime';
import { mapErrorToHttp, ValidationError } from '$lib/server/errors';
import { resolveLink } from '$lib/server/modules/registration/link-service';
import { submitRegistration } from '$lib/server/modules/registration/submit';
import { ensureDeviceId } from '../device-cookie';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, cookies }) => {
	const link = await resolveLink(params.token);
	if (!link) error(404, 'Not found');
	ensureDeviceId(cookies);
	return { branchName: link.branchName, form: await superValidate(zod4(registrationSchema)) };
};

export const actions: Actions = {
	default: async ({ params, request, cookies, getClientAddress }) => {
		const form = await superValidate(request, zod4(registrationSchema));
		if (!form.valid) return fail(400, { form });
		const meta = { ip: getClientAddress(), deviceId: ensureDeviceId(cookies), locale: getLocale() };
		try {
			await submitRegistration(params.token, form.data, meta);
		} catch (err) {
			if (err instanceof ValidationError) return message(form, err.message, { status: 400 });
			mapErrorToHttp(err);
		}
		redirect(303, `/register/${params.token}/done`);
	}
};
