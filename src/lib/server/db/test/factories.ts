import { db } from '$lib/server/db/client';
import { createHash } from 'node:crypto';
import {
	accounts,
	attachments,
	branches,
	cities,
	countries,
	households,
	memberProfiles,
	people,
	regions,
	registrationLinks,
	registrations
} from '$lib/server/db/schema';
import { hashPassword } from '$lib/server/modules/auth/password';

export type NewBranch = typeof branches.$inferInsert;
export type NewAccount = typeof accounts.$inferInsert;
export type NewRegistrationLink = typeof registrationLinks.$inferInsert;
export type NewRegistration = typeof registrations.$inferInsert;
export type NewMemberProfile = typeof memberProfiles.$inferInsert;
export type NewAttachment = typeof attachments.$inferInsert;
export type NewPerson = typeof people.$inferInsert;

let counter = 0;
// Base-26 letters, so unique codes (iso2, branch code) never collide within a run.
const letters = (n: number, width: number) =>
	Array.from({ length: width }, (_, i) => String.fromCharCode(65 + (Math.floor(n / 26 ** i) % 26)))
		.reverse()
		.join('');

export async function makeCity() {
	const n = ++counter;
	const [country] = await db
		.insert(countries)
		.values({ iso2: letters(n, 2), name: `Country ${n}` })
		.returning();
	const [region] = await db
		.insert(regions)
		.values({ countryId: country.id, name: `Region ${n}` })
		.returning();
	const [city] = await db
		.insert(cities)
		.values({ regionId: region.id, name: `City ${n}` })
		.returning();
	return city;
}

export async function makeBranch(overrides: Partial<NewBranch> = {}) {
	const [branch] = await db
		.insert(branches)
		.values({
			code: `B${letters(++counter, 4)}`,
			name: 'Test Branch',
			addressLine: 'Jl. Test 1',
			cityId: overrides.cityId ?? (await makeCity()).id,
			timezone: 'Asia/Jakarta',
			...overrides
		})
		.returning();
	return branch;
}

export async function makeHousehold() {
	const [household] = await db.insert(households).values({}).returning();
	return household;
}

export async function makePerson(overrides: Partial<NewPerson> = {}) {
	const n = ++counter;
	const [person] = await db
		.insert(people)
		.values({
			memberCode: `T-${n}`,
			fullName: `Person ${n}`,
			sex: 'male',
			birthDate: '1990-01-01',
			addressLine: 'Jl. Test 1',
			homeBranchId: overrides.homeBranchId ?? (await makeBranch()).id,
			householdId: overrides.householdId ?? (await makeHousehold()).id,
			cityId: overrides.cityId ?? (await makeCity()).id,
			...overrides
		})
		.returning();
	return person;
}

export async function makeAccount(personId: string, overrides: Partial<NewAccount> = {}) {
	const n = ++counter;
	const [account] = await db
		.insert(accounts)
		.values({
			personId,
			email: `person${n}@mail.test`,
			passwordHash: await hashPassword('correct-horse'),
			activatedAt: new Date(),
			...overrides
		})
		.returning();
	return account;
}

export async function makeRegistrationLink(overrides: Partial<NewRegistrationLink> = {}) {
	const [link] = await db
		.insert(registrationLinks)
		.values({
			tokenHash: createHash('sha256').update(String(++counter)).digest('hex'),
			branchId: overrides.branchId ?? (await makeBranch()).id,
			createdByPersonId: overrides.createdByPersonId ?? (await makePerson()).id,
			...overrides
		})
		.returning();
	return link;
}

export async function makeRegistration(overrides: Partial<NewRegistration> = {}) {
	const branchId = overrides.branchId ?? (await makeBranch()).id;
	const [registration] = await db
		.insert(registrations)
		.values({
			registrationLinkId:
				overrides.registrationLinkId ?? (await makeRegistrationLink({ branchId })).id,
			branchId,
			payload: {},
			locale: 'id',
			contactEmail: `reg${++counter}@mail.test`,
			...overrides
		})
		.returning();
	return registration;
}

export async function makeMemberProfile(
	personId: string,
	overrides: Partial<NewMemberProfile> = {}
) {
	const [profile] = await db
		.insert(memberProfiles)
		.values({
			personId,
			occupation: 'employee',
			education: 'bachelor',
			baptized: false,
			sidi: false,
			...overrides
		})
		.returning();
	return profile;
}

export async function makeAttachment(overrides: Partial<NewAttachment> = {}) {
	const n = ++counter;
	const [attachment] = await db
		.insert(attachments)
		.values({
			ownerType: 'person',
			ownerId: overrides.ownerId ?? (await makePerson()).id,
			purpose: 'profile_photo',
			storageKey: `test/${n}`,
			contentType: 'image/jpeg',
			sizeBytes: 1,
			sha256: createHash('sha256').update(String(n)).digest('hex'),
			uploadedByPersonId: overrides.uploadedByPersonId ?? (await makePerson()).id,
			...overrides
		})
		.returning();
	return attachment;
}
