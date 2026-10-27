import postgres from 'postgres';

// Login codes are rate limited per person, so a rerun right after a run would be refused.
export default async function globalSetup() {
	const url =
		process.env.DATABASE_URL ?? 'postgres://churchapp:churchapp@127.0.0.1:55432/churchapp_dev';
	const sql = postgres(url);
	await sql`delete from otp_codes`;
	await sql`delete from login_throttles`;
	await sql.end();
}
