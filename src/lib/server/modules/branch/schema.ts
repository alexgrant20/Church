import { z } from 'zod';

export const createBranchSchema = z.object({
	name: z.string().min(1).max(255),
	address: z.string().max(500).nullable().optional().default(null)
});
export type CreateBranchInput = z.infer<typeof createBranchSchema>;
