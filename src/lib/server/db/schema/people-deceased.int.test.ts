import { describe, it, expect, beforeEach } from 'vitest';
import { resetDb } from '$lib/server/db/test/reset';
import { makePerson } from '$lib/server/db/test/factories';

describe('date of death', () => {
	beforeEach(resetDb);

	it('stores a date of death', async () => {
		const person = await makePerson({ deceasedOn: '2026-10-01' });
		expect(person.deceasedOn).toBe('2026-10-01');
	});

	it('is null by default', async () => {
		expect((await makePerson()).deceasedOn).toBeNull();
	});
});
