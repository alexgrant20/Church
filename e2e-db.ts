import { createHash, randomBytes } from 'node:crypto';
import postgres from 'postgres';

// Playwright cannot import the app's $lib services, so e2e tests set up their rows here, in the
// same dev database the preview server uses.
export const sql = postgres(
	process.env.DATABASE_URL ?? 'postgres://churchapp:churchapp@127.0.0.1:55432/churchapp_dev',
	{ max: 2, onnotice: () => {} }
);

export const sha256 = (token: string) => createHash('sha256').update(token).digest('hex');
export const newToken = () => randomBytes(32).toString('base64url');
export const uniq = () => Math.random().toString(36).slice(2, 10);

export async function personIdByEmail(email: string): Promise<string> {
	const [row] = await sql`select person_id from accounts where email = ${email}`;
	return row.person_id;
}

export async function branchByCode(code: string): Promise<{ id: string; name: string }> {
	const [row] =
		await sql`select id, name from branches where code = ${code} and deleted_at is null`;
	return { id: row.id, name: row.name };
}

// A branch of its own keeps the public form tests clear of the staff link page, which replaces
// the JKT link when it is opened.
export async function e2eBranch(code = 'E2EREG'): Promise<{ id: string; name: string }> {
	const [found] = await sql`select id from branches where code = ${code} and deleted_at is null`;
	if (!found) {
		const [city] = await sql`select id from cities order by name limit 1`;
		await sql`
			insert into branches (code, name, address_line, city_id, timezone)
			values (${code}, ${'GRII E2E ' + code}, 'Jl. Uji 1', ${city.id}, 'Asia/Jakarta')`;
	}
	return branchByCode(code);
}

// Replaces the branch's live link with one whose token the test knows.
export async function freshLink(branchId: string): Promise<string> {
	const token = newToken();
	const createdBy = await personIdByEmail('admin@grii.test');
	await sql.begin(async (tx) => {
		await tx`update registration_links set revoked_at = now()
			where branch_id = ${branchId} and revoked_at is null and deleted_at is null`;
		await tx`insert into registration_links (token_hash, branch_id, created_by_person_id)
			values (${sha256(token)}, ${branchId}, ${createdBy})`;
	});
	return token;
}

export async function cityIds(count: number): Promise<string[]> {
	const rows = await sql`select id from cities order by name limit ${count}`;
	return rows.map((r) => r.id);
}
