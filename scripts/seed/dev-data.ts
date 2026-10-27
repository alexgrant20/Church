import { createHash, randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import * as schema from '../../src/lib/server/db/schema';
import { hashPassword } from '../../src/lib/server/modules/auth/password';
import { nextMemberCode } from '../../src/lib/server/modules/people/member-code';
import type { SeedDb } from './locations';

const {
	accounts,
	branches,
	cities,
	households,
	memberProfiles,
	people,
	personRelationships,
	registrationLinks,
	roleAssignments
} = schema;

const PASSWORD = 'devpassword123';
const YEAR = new Date().getFullYear();

type Branch = typeof branches.$inferSelect;
type PersonSeed = {
	fullName: string;
	sex: 'male' | 'female';
	birthDate: string;
	branch: Branch;
	householdId: string;
	email?: string;
};

async function cityByName(db: SeedDb, name: string) {
	const [city] = await db.select({ id: cities.id }).from(cities).where(eq(cities.name, name));
	if (!city) throw new Error(`City "${name}" is missing: seed locations first`);
	return city.id;
}

async function createBranch(
	db: SeedDb,
	data: { code: string; name: string; cityName: string }
): Promise<Branch> {
	const [branch] = await db
		.insert(branches)
		.values({
			code: data.code,
			name: data.name,
			addressLine: 'Jl. Contoh No. 1',
			cityId: await cityByName(db, data.cityName),
			timezone: 'Asia/Jakarta'
		})
		.returning();
	return branch;
}

async function createPerson(db: SeedDb, seed: PersonSeed) {
	const [person] = await db.transaction(async (tx) =>
		tx
			.insert(people)
			.values({
				memberCode: await nextMemberCode(tx, seed.branch, YEAR),
				fullName: seed.fullName,
				sex: seed.sex,
				birthDate: seed.birthDate,
				homeBranchId: seed.branch.id,
				householdId: seed.householdId,
				addressLine: 'Jl. Contoh No. 1',
				cityId: seed.branch.cityId
			})
			.returning()
	);
	await db.insert(memberProfiles).values({
		personId: person.id,
		occupation: 'employee',
		education: 'bachelor',
		baptized: false,
		sidi: false
	});
	if (seed.email) {
		await db.insert(accounts).values({
			personId: person.id,
			email: seed.email,
			passwordHash: await hashPassword(PASSWORD),
			activatedAt: new Date()
		});
	}
	return person;
}

async function newHousehold(db: SeedDb) {
	const [household] = await db.insert(households).values({}).returning({ id: households.id });
	return household.id;
}

async function seedFamily(db: SeedDb, jkt: Branch, kg: Branch) {
	const householdId = await newHousehold(db);
	const base = { householdId };
	const budi = await createPerson(db, {
		...base,
		fullName: 'Budi Santoso',
		sex: 'male',
		birthDate: '1980-04-12',
		branch: jkt,
		email: 'budi@grii.test'
	});
	const sari = await createPerson(db, {
		...base,
		fullName: 'Sari Santoso',
		sex: 'female',
		birthDate: '1983-09-30',
		branch: kg
	});
	const andi = await createPerson(db, {
		...base,
		fullName: 'Andi Santoso',
		sex: 'male',
		birthDate: '2011-02-20',
		branch: kg
	});
	await db.insert(accounts).values({ personId: sari.id, email: 'sari@grii.test' });
	const [first, second] = budi.id < sari.id ? [budi, sari] : [sari, budi];
	await db.insert(personRelationships).values([
		{ kind: 'spouse', personId: first.id, relatedPersonId: second.id },
		{ kind: 'parent', personId: budi.id, relatedPersonId: andi.id },
		{ kind: 'parent', personId: sari.id, relatedPersonId: andi.id }
	]);
}

export async function seedDevData(db: SeedDb): Promise<boolean> {
	if (process.env.NODE_ENV === 'production')
		throw new Error('Refusing to seed dev data in production');
	if ((await db.select({ id: branches.id }).from(branches).limit(1)).length > 0) return false;

	const jkt = await createBranch(db, {
		code: 'JKT',
		name: 'GRII Pusat',
		cityName: 'Kota Administrasi Jakarta Pusat'
	});
	const kg = await createBranch(db, {
		code: 'KG',
		name: 'GRII Kelapa Gading',
		cityName: 'Kota Administrasi Jakarta Utara'
	});

	const admin = await createPerson(db, {
		fullName: 'Super Admin',
		sex: 'male',
		birthDate: '1975-01-01',
		branch: jkt,
		householdId: await newHousehold(db),
		email: 'admin@grii.test'
	});
	const rina = await createPerson(db, {
		fullName: 'Rina Wijaya',
		sex: 'female',
		birthDate: '1988-06-15',
		branch: jkt,
		householdId: await newHousehold(db),
		email: 'rina@grii.test'
	});
	await db.insert(roleAssignments).values([
		{ personId: admin.id, role: 'superadmin' },
		{ personId: rina.id, role: 'branch_admin', branchId: jkt.id }
	]);
	await seedFamily(db, jkt, kg);
	// Only the hash is stored; the token itself is not needed until the link UI exists.
	await db.insert(registrationLinks).values(
		[jkt, kg].map((branch) => ({
			tokenHash: createHash('sha256').update(randomBytes(32)).digest('hex'),
			branchId: branch.id,
			createdByPersonId: admin.id
		}))
	);
	await db
		.insert(schema.systemSettings)
		.values({ key: 'household.adults_act_for_activated_adults', value: true });
	return true;
}
