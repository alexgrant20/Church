import { z } from 'zod';
import { env } from '$env/dynamic/private';
import { building } from '$app/environment';

const key32 = z
	.string()
	.refine((v) => Buffer.from(v, 'base64').length === 32, 'must be base64 of 32 bytes');

const configSchema = z.object({
	DATABASE_URL: z.string().url(),
	NIK_ENCRYPTION_KEY: key32,
	HMAC_KEY: key32,
	SESSION_COOKIE_NAME: z.string().default('churchapp_session'),
	ORIGIN: z.string().url().default('http://localhost:5173'),
	NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
	MESSAGE_TRANSPORT: z.enum(['log', 'live']).default('log'),
	MESSAGE_LOG_FILE: z.string().optional(),
	WHATSAPP_ACCESS_TOKEN: z.string().optional(),
	WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
	SMTP_HOST: z.string().optional(),
	SMTP_PORT: z.coerce.number().default(587),
	SMTP_USER: z.string().optional(),
	SMTP_PASSWORD: z.string().optional(),
	SMTP_FROM: z.string().optional(),
	LOGIN_MAX_FAILED_ATTEMPTS: z.coerce.number().int().positive().default(5)
});

const liveRequired = [
	'WHATSAPP_ACCESS_TOKEN',
	'WHATSAPP_PHONE_NUMBER_ID',
	'SMTP_HOST',
	'SMTP_USER',
	'SMTP_PASSWORD',
	'SMTP_FROM'
] as const;

const checkedSchema = configSchema.superRefine((c, ctx) => {
	// The log transport prints OTP codes, so it must never run in production. The build only
	// analyses the server code and sends nothing, so it is exempt (e2e builds with the log transport).
	if (!building && c.NODE_ENV === 'production' && c.MESSAGE_TRANSPORT !== 'live')
		ctx.addIssue({
			code: 'custom',
			path: ['MESSAGE_TRANSPORT'],
			message: 'must be live in production'
		});
	if (c.MESSAGE_TRANSPORT !== 'live') return;
	for (const key of liveRequired) {
		if (!c[key])
			ctx.addIssue({
				code: 'custom',
				path: [key],
				message: 'required when MESSAGE_TRANSPORT=live'
			});
	}
});

const parsed = checkedSchema.safeParse(env);
if (!parsed.success) {
	console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
	throw new Error('Invalid environment configuration — check .env against .env.example');
}

export const config = parsed.data;
