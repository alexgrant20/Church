import { json } from '@sveltejs/kit';
import { mapErrorToHttp } from '$lib/server/errors';
import { parsePage } from '$lib/server/pagination';
import { searchCities } from '$lib/server/modules/location/service';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	try {
		return json(await searchCities({ q: url.searchParams.get('q') ?? '', ...parsePage(url) }));
	} catch (err) {
		mapErrorToHttp(err);
	}
};
