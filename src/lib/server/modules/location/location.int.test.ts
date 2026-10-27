import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '$lib/server/db/client';
import { cities } from '$lib/server/db/schema';
import { resetDb } from '$lib/server/db/test/reset';
import { makeCity } from '$lib/server/db/test/factories';
import { searchCities } from './service';

describe('searchCities', () => {
	beforeEach(async () => {
		await resetDb();
		const { regionId } = await makeCity();
		await db.insert(cities).values(
			['Jakarta Selatan', 'Jakarta Utara', 'Jakarta Barat', 'Bandung'].map((name) => ({
				regionId,
				name
			}))
		);
	});

	it('finds a city from part of its name', async () => {
		const { items, nextCursor } = await searchCities({ q: 'jakarta sel', cursor: null, limit: 50 });
		expect(items.map((c) => c.name)).toEqual(['Jakarta Selatan']);
		expect(items[0].region).toMatch(/^Region/);
		expect(nextCursor).toBeNull();
	});

	it('pages with a cursor', async () => {
		const first = await searchCities({ q: 'jakarta', cursor: null, limit: 2 });
		expect(first.items.map((c) => c.name)).toEqual(['Jakarta Barat', 'Jakarta Selatan']);
		const key = JSON.parse(Buffer.from(first.nextCursor!, 'base64url').toString());
		const second = await searchCities({ q: 'jakarta', cursor: key, limit: 2 });
		expect(second.items.map((c) => c.name)).toEqual(['Jakarta Utara']);
		expect(second.nextCursor).toBeNull();
	});
});
