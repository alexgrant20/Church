import { fail, redirect } from '@sveltejs/kit';
import { message, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { registrationSchema } from '$lib/registration/schema';
import { getLocale } from '$lib/paraglide/runtime';
import { mapErrorToHttp, ValidationError } from '$lib/server/errors';
import { loadFix, resubmitFix } from '$lib/server/modules/registration/fix';
import { ensureDeviceId } from '../../device-cookie';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, cookies }) => {
	try {
		const { input, ...fix } = await loadFix(params.token);
		ensureDeviceId(cookies);
		const form = await superValidate(input, zod4(registrationSchema), { errors: false });
		return { ...fix, form };
	} catch (err) {
		mapErrorToHttp(err);
	}
};

export const actions: Actions = {
	default: async ({ params, request, cookies, getClientAddress }) => {
		const form = await superValidate(request, zod4(registrationSchema));
		if (!form.valid) return fail(400, { form });
		const meta = { ip: getClientAddress(), deviceId: ensureDeviceId(cookies), locale: getLocale() };
		try {
			await resubmitFix(params.token, form.data, meta);
		} catch (err) {
			if (err instanceof ValidationError) return message(form, err.message, { status: 400 });
			mapErrorToHttp(err);
		}
		redirect(303, `/register/fix/${params.token}/done`);
	}
};
