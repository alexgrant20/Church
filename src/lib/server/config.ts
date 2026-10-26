import { z } from 'zod';
import { env } from '$env/dynamic/private';

const key32 = z
	.string()
	.refine((v) => Buffer.from(v, 'base64').length === 32, 'must be base64 of 32 bytes');

const configSchema = z.object({
	DATABASE_URL: z.string().url(),
	NIK_ENCRYPTION_KEY: key32,
	HMAC_KEY: key32,
	SESSION_COOKIE_NAME: z.string().default('churchapp_session'),
	ORIGIN: z.string().url().default('http://localhost:5173'),
	NODE_ENV: z.enum(['development', 'test', 'production']).default('development')
});

const parsed = configSchema.safeParse(env);
if (!parsed.success) {
	console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
	throw new Error('Invalid environment configuration — check .env against .env.example');
}

export const config = parsed.data;
