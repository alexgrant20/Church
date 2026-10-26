import { z } from 'zod';

export const assignPastorSchema = z.object({
	personId: z.string().uuid(),
	branchId: z.string().uuid()
});
export type AssignPastorInput = z.infer<typeof assignPastorSchema>;
