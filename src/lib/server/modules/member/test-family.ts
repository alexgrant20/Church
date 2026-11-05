import { db } from '$lib/server/db/client';
import { personRelationships } from '$lib/server/db/schema';
import { encryptNik, keyedHash } from '$lib/server/crypto';
import {
	makeAccount,
	makeBranch,
	makeHousehold,
	makeMemberProfile,
	makePerson
} from '$lib/server/db/test/factories';

const nik = '3174012345670001';

export async function familyOfBudi() {
	const [a, b] = [await makeBranch(), await makeBranch()];
	const home = await makeHousehold();
	const budi = await makePerson({
		homeBranchId: a.id,
		householdId: home.id,
		fullName: 'Budi',
		nikEncrypted: encryptNik(nik),
		nikHash: keyedHash(nik)
	});
	await makeMemberProfile(budi.id);
	await makeAccount(budi.id, { email: 'budi@mail.test' });
	const sari = await makePerson({ homeBranchId: b.id, householdId: home.id, fullName: 'Sari' });
	const andi = await makePerson({ homeBranchId: b.id, householdId: home.id, fullName: 'Andi' });
	const aunt = await makePerson({
		homeBranchId: a.id,
		householdId: home.id,
		fullName: 'Aunt',
		isMember: false,
		memberCode: null
	});
	const mother = await makePerson({ homeBranchId: a.id, fullName: 'Mother' });
	const son = await makePerson({ homeBranchId: b.id, fullName: 'Son' });
	const [x, y] = [budi.id, sari.id].sort();
	await db.insert(personRelationships).values([
		{ kind: 'spouse', personId: x, relatedPersonId: y },
		{ kind: 'parent', personId: budi.id, relatedPersonId: andi.id },
		{ kind: 'parent', personId: sari.id, relatedPersonId: andi.id },
		{ kind: 'parent', personId: mother.id, relatedPersonId: budi.id },
		{ kind: 'parent', personId: budi.id, relatedPersonId: son.id }
	]);
	return { a, b, budi, sari, andi, aunt, mother, son };
}
