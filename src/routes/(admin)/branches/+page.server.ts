import type { Actions, PageServerLoad } from './$types';
import { fail } from '@sveltejs/kit';
import { createBranch, listBranches } from '$lib/server/modules/branch/service';
import { ValidationError } from '$lib/server/errors';

export const load: PageServerLoad = async () => {
	return { branches: await listBranches() };
};

export const actions: Actions = {
	default: async ({ request }) => {
		const formData = await request.formData();
		const name = formData.get('name');
		const address = formData.get('address');

		try {
			await createBranch({ name, address: address || null });
		} catch (err) {
			if (err instanceof ValidationError) {
				return fail(400, { message: err.message });
			}
			throw err;
		}

		return { success: true };
	}
};
