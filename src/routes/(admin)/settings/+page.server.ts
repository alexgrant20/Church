import { error, fail } from '@sveltejs/kit';
import { message, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { settingsFormSchema } from '$lib/settings/schema';
import { mapErrorToHttp } from '$lib/server/errors';
import { canEditSettings, getSetting, setSetting } from '$lib/server/modules/settings/service';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	if (!canEditSettings()) error(403, 'Forbidden');
	const familyTreeEnabled = await getSetting('membership.family_tree_enabled');
	return { form: await superValidate({ familyTreeEnabled }, zod4(settingsFormSchema)) };
};

export const actions: Actions = {
	default: async ({ request }) => {
		const form = await superValidate(request, zod4(settingsFormSchema));
		if (!form.valid) return fail(400, { form });
		try {
			await setSetting('membership.family_tree_enabled', form.data.familyTreeEnabled);
		} catch (err) {
			mapErrorToHttp(err);
		}
		return message(form, 'saved');
	}
};
