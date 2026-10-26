import { z } from 'zod';

const timezones = new Set(Intl.supportedValuesOf('timeZone'));

export const createBranchSchema = z.object({
	code: z.string().regex(/^[A-Z]{2,8}$/),
	name: z.string().min(1).max(255),
	addressLine: z.string().min(1).max(500),
	postalCode: z.string().max(10).nullable().default(null),
	cityId: z.uuid(),
	timezone: z.string().refine((tz) => timezones.has(tz))
});
export type CreateBranchInput = z.infer<typeof createBranchSchema>;
