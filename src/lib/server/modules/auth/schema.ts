import { z } from 'zod';

export const loginSchema = z.object({
	identifier: z.string().min(1, 'Email or phone is required'),
	password: z.string().min(8)
});
export type LoginInput = z.infer<typeof loginSchema>;
