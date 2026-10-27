import { beforeEach, describe, expect, it, vi } from 'vitest';

const key = Buffer.alloc(32, 1).toString('base64');
const base = {
	DATABASE_URL: 'postgres://u:p@localhost:5432/db',
	NIK_ENCRYPTION_KEY: key,
	HMAC_KEY: key
};

async function load(extra: Record<string, string>) {
	vi.resetModules();
	vi.doMock('$env/dynamic/private', () => ({ env: { ...base, ...extra } }));
	return import('./config');
}

describe('config', () => {
	beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => {}));

	it('rejects the log transport in production', async () => {
		await expect(load({ NODE_ENV: 'production', MESSAGE_TRANSPORT: 'log' })).rejects.toThrow(
			'Invalid environment configuration'
		);
	});

	it('allows the log transport outside production', async () => {
		const { config } = await load({ NODE_ENV: 'development' });
		expect(config.MESSAGE_TRANSPORT).toBe('log');
	});
});
