import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '$lib/server/db/client';
import { resetDb } from '$lib/server/db/test/reset';
import { makeHousehold, makeRegistrationLink } from '$lib/server/db/test/factories';
import { claimRegistrationLink } from './repository';

describe('registration links', () => {
	beforeEach(resetDb);

	it('can be claimed only once', async () => {
		const link = await makeRegistrationLink();
		const [h1, h2] = [await makeHousehold(), await makeHousehold()];
		expect(
			await db.transaction((tx) => claimRegistrationLink(tx, link.tokenHash, h1.id))
		).not.toBeNull();
		expect(
			await db.transaction((tx) => claimRegistrationLink(tx, link.tokenHash, h2.id))
		).toBeNull();
	});
	it('cannot be claimed after revocation', async () => {
		const link = await makeRegistrationLink({ revokedAt: new Date() });
		const h = await makeHousehold();
		expect(
			await db.transaction((tx) => claimRegistrationLink(tx, link.tokenHash, h.id))
		).toBeNull();
	});
});
