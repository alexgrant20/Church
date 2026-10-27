import { createCipheriv, createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
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

// The preview server reads .env; the NIK in a seeded payload must be encrypted with the same key.
function envValue(name: string): string {
	const line = readFileSync('.env', 'utf8')
		.split('\n')
		.find((l) => l.startsWith(`${name}=`));
	return (process.env[name] ?? line?.slice(name.length + 1) ?? '').trim();
}

export function encryptNik(nik: string): string {
	const iv = randomBytes(12);
	const key = Buffer.from(envValue('NIK_ENCRYPTION_KEY'), 'base64');
	const cipher = createCipheriv('aes-256-gcm', key, iv);
	const body = Buffer.concat([cipher.update(nik, 'utf8'), cipher.final()]);
	return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64');
}

export type SeedPerson = { fullName: string; birthDate?: string; extra?: Record<string, unknown> };

export async function storedPeople(people: SeedPerson[]) {
	const [cityId] = await cityIds(1);
	return people.map((p, i) => ({
		relation: i === 0 ? 'self' : 'child',
		fullName: p.fullName,
		nickname: p.fullName.split(' ')[0],
		sex: 'female',
		birthDate: p.birthDate ?? '1985-01-01',
		birthCityId: cityId,
		address: { line: 'Jl. Uji 2', postalCode: '12345', cityId },
		occupation: 'employee',
		education: 'bachelor',
		previousChurch: null,
		baptism: { baptized: false },
		sidi: { sidi: false },
		...(i === 0 ? { email: `reg-${uniq()}@mail.test` } : {}),
		...p.extra
	}));
}

type RegistrationSeed = {
	people: SeedPerson[];
	submittedAt?: Date;
	status?: 'pending' | 'needs_fix';
	fixToken?: string;
	fixReason?: string;
};

export async function insertRegistration(branchId: string, seed: RegistrationSeed) {
	const people = await storedPeople(seed.people);
	const [link] = await sql`select id from registration_links where branch_id = ${branchId}
		order by created_at desc limit 1`;
	const [row] = await sql`
		insert into registrations (registration_link_id, branch_id, status, payload, locale,
			contact_email, submitted_at, fix_reason, fix_token_hash)
		values (${link.id}, ${branchId}, ${seed.status ?? 'pending'},
			${sql.json({ parentsMarried: true, people })}, 'en', ${people[0].email as string},
			${seed.submittedAt ?? new Date()}, ${seed.fixReason ?? null},
			${seed.fixToken ? sha256(seed.fixToken) : null})
		returning id`;
	return { id: row.id as string, registrantEmail: people[0].email as string };
}

export async function insertConsent(
	registrationId: string,
	personIndex: number,
	matchedPersonId: string,
	token: string | null
) {
	await sql`insert into registration_consents (registration_id, person_index, matched_person_id, token_hash)
		values (${registrationId}, ${personIndex}, ${matchedPersonId}, ${token ? sha256(token) : null})`;
}

export async function memberOf(branchId: string) {
	const [row] = await sql`select id, full_name, birth_date::text as birth_date, member_code
		from people where home_branch_id = ${branchId} and member_code is not null
		and deleted_at is null order by member_code limit 1`;
	return {
		id: row.id as string,
		fullName: row.full_name as string,
		birthDate: row.birth_date as string,
		memberCode: row.member_code as string
	};
}

// One staff login per e2e file: a person gets one sign-in code per minute, so files running in
// parallel must not share an identity. The password is the seeded one (copied from Rina).
export async function ensureStaff(
	email: string,
	role: 'branch_admin' | 'superadmin',
	branchCode = 'JKT'
): Promise<string> {
	const [found] = await sql`select person_id from accounts where email = ${email}`;
	if (found) return found.person_id;
	const branch = await branchByCode(branchCode);
	return sql.begin(async (tx) => {
		const [household] = await tx`insert into households default values returning id`;
		const [person] = await tx`
			insert into people (is_member, full_name, sex, birth_date, home_branch_id, household_id,
				address_line, city_id)
			select false, ${'E2E ' + email}, 'female', '1980-01-01', id, ${household.id},
				'Jl. Uji 3', city_id from branches where id = ${branch.id}
			returning id`;
		await tx`
			insert into accounts (person_id, email, password_hash, activated_at)
			select ${person.id}, ${email}, password_hash, now() from accounts
			where email = 'rina@grii.test'`;
		await tx`insert into role_assignments (person_id, role, branch_id)
			values (${person.id}, ${role}, ${role === 'superadmin' ? null : branch.id})`;
		return person.id as string;
	});
}
