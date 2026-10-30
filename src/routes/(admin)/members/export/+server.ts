import { mapErrorToHttp } from '$lib/server/errors';
import { getLocale } from '$lib/paraglide/runtime';
import { exportMembers } from '$lib/server/modules/member/export-service';
import { parseMemberFilters } from '$lib/server/modules/member/filters';
import { membersXlsxStream } from '$lib/server/modules/member/xlsx';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	// Errors map before the first byte, so a refused export never sends half a file.
	let result: Awaited<ReturnType<typeof exportMembers>>;
	try {
		result = await exportMembers(parseMemberFilters(url));
	} catch (err) {
		mapErrorToHttp(err);
	}
	return new Response(membersXlsxStream(result.rows, getLocale()), {
		headers: {
			'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			'content-disposition': `attachment; filename="${result.filename}"`
		}
	});
};
