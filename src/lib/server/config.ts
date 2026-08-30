import { z } from 'zod';
import { env } from '$env/dynamic/private';

const configSchema = z.object({
	DATABASE_URL: z.string().url(),
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
