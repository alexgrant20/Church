import { describe, it, expect, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import { registrationLinks } from '$lib/server/db/schema';
import { resetDb } from '$lib/server/db/test/reset';
import { expectDbError } from '$lib/server/db/test/expect-db-error';
import {
	makeBranch,
	makeMemberProfile,
	makePerson,
	makeRegistration,
	makeRegistrationLink
} from '$lib/server/db/test/factories';

describe('registration schema', () => {
	beforeEach(resetDb);

	it('allows one live link per branch', async () => {
		const branch = await makeBranch();
		const first = await makeRegistrationLink({ branchId: branch.id });
		await expectDbError(makeRegistrationLink({ branchId: branch.id }), /unique/);
		await db
			.update(registrationLinks)
			.set({ revokedAt: new Date() })
			.where(eq(registrationLinks.id, first.id));
		await expect(makeRegistrationLink({ branchId: branch.id })).resolves.toBeDefined();
	});

	it('a member needs a Member ID and a non-member must not have one', async () => {
		await expect(makePerson({ isMember: false, memberCode: null })).resolves.toBeDefined();
		await expectDbError(makePerson({ isMember: true, memberCode: null }), /check/);
		await expectDbError(makePerson({ isMember: false, memberCode: 'X' }), /check/);
	});

	it('baptism date and church follow the yes/no', async () => {
		const p = await makePerson();
		await expectDbError(makeMemberProfile(p.id, { baptized: true }), /check/);
		await expectDbError(
			makeMemberProfile((await makePerson()).id, { baptized: false, baptismDate: '2000-01-01' }),
			/check/
		);
		await expect(
			makeMemberProfile((await makePerson()).id, {
				baptized: true,
				baptismDate: '2000-01-01',
				baptismChurch: 'GRII'
			})
		).resolves.toBeDefined();
	});

	it('a registration needs a contact', async () => {
		await expectDbError(makeRegistration({ contactEmail: null, contactPhone: null }), /check/);
		await expect(makeRegistration({ contactPhone: null })).resolves.toBeDefined();
	});
});
