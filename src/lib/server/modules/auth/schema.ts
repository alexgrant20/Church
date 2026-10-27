import { z } from 'zod';

export const loginSchema = z.object({
	identifier: z.string().min(1, 'Email or phone is required'),
	password: z.string().min(8)
});
export type LoginInput = z.infer<typeof loginSchema>;

export const startActivationSchema = z.object({ identifier: z.string().min(1) });

export const completeActivationSchema = z.object({
	challengeToken: z.string().min(1),
	code: z.string().min(1),
	password: loginSchema.shape.password
});
