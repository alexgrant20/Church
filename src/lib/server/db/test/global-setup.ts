import postgres from 'postgres';
import { loadEnv } from 'vite';
import { runMigrations } from '../migrate';

export default async function setup() {
	const url = loadEnv('test', process.cwd(), '').DATABASE_URL;
	if (!url || !new URL(url).pathname.endsWith('_test')) {
		throw new Error('Refusing to reset a database whose name does not end in _test');
	}
	const client = postgres(url, { max: 1, onnotice: () => {} });
	try {
		await client.unsafe(
			'drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;'
		);
	} finally {
		await client.end();
	}
	await runMigrations(url);
}
