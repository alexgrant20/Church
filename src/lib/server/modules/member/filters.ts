import { z } from 'zod';
import { ValidationError } from '$lib/server/errors';

export const memberFiltersSchema = z.object({
	q: z
		.string()
		.trim()
		.max(100)
		.optional()
		.transform((q) => q || undefined),
	cityId: z.uuid().optional(),
	branchId: z.uuid().optional(),
	status: z.enum(['active', 'deceased']).default('active')
});

export type MemberFilters = {
	q?: string;
	cityId?: string;
	branchId?: string;
	status: 'active' | 'deceased';
};

export function parseMemberFilters(url: URL): MemberFilters {
	const raw = Object.fromEntries(
		['q', 'cityId', 'branchId', 'status'].flatMap((k) => {
			const v = url.searchParams.get(k);
			return v ? [[k, v]] : [];
		})
	);
	const parsed = memberFiltersSchema.safeParse(raw);
	if (!parsed.success) throw new ValidationError('error_bad_filter');
	return parsed.data;
}
