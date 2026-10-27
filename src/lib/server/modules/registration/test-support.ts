import { encryptNik, keyedHash } from '$lib/server/crypto';
import { runWithContext, type RoleAssignment } from '$lib/server/context';
import {
	makeBranch,
	makeCity,
	makeRegistration,
	makeRegistrationLink
} from '$lib/server/db/test/factories';
import type { NewRegistration } from '$lib/server/db/test/factories';

export const asStaff = <T>(role: RoleAssignment['role'], branchId: string | null, fn: () => T) =>
	runWithContext(
		{
			personId: null,
			actingAsPersonId: null,
			ip: '127.0.0.1',
			roleAssignments: [{ role, branchId, groupId: null }]
		},
		fn
	);

let seq = 0;

export function storedPerson(cityId: string, relation: string, n: number, extra = {}) {
	const nik = String(3174012345000000 + ++seq);
	return {
		relation,
		fullName: `Person ${n}`,
		nickname: `P${n}`,
		sex: 'male',
		birthDate: '1990-01-01',
		birthCityId: cityId,
		nikEncrypted: encryptNik(nik).toString('base64'),
		nikHash: keyedHash(nik),
		email: `p${n}-${Math.random().toString(36).slice(2)}@mail.test`,
		address: { line: 'Jl. A', postalCode: '12345', cityId },
		occupation: 'employee',
		education: 'bachelor',
		previousChurch: null,
		baptism: { baptized: false },
		sidi: { sidi: true, date: '2010-01-01', church: 'GRII X' },
		...extra
	};
}

export async function setup() {
	const branch = await makeBranch();
	const city = await makeCity();
	const link = await makeRegistrationLink({ branchId: branch.id });
	const reg = (relations: string[], o: Partial<NewRegistration> = {}, extras: object[] = []) =>
		makeRegistration({
			branchId: branch.id,
			registrationLinkId: link.id,
			payload: {
				parentsMarried: true,
				people: relations.map((r, i) => storedPerson(city.id, r, i + 1, extras[i]))
			},
			...o
		});
	return { branch, city, reg };
}
