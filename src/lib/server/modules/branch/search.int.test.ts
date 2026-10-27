import { beforeEach, describe, expect, it } from 'vitest';
import { resetDb } from '$lib/server/db/test/reset';
import { makeBranch } from '$lib/server/db/test/factories';
import { asStaff } from '$lib/server/modules/registration/test-support';
import { searchBranches } from './service';

describe('searchBranches', () => {
	let jakarta: { id: string };

	beforeEach(async () => {
		await resetDb();
		jakarta = await makeBranch({ code: 'JKT', name: 'GRII Jakarta' });
		await makeBranch({ code: 'BDG', name: 'GRII Bandung' });
		await makeBranch({ code: 'KG', name: 'GRII Kelapa Gading' });
	});

	it('finds a branch by name or code and pages with a cursor', async () => {
		const byCode = await asStaff('superadmin', null, () =>
			searchBranches({ q: 'bdg', cursor: null, limit: 50 })
		);
		expect(byCode.items.map((b) => b.code)).toEqual(['BDG']);
		const first = await asStaff('superadmin', null, () =>
			searchBranches({ q: 'grii', cursor: null, limit: 2 })
		);
		expect(first.items.map((b) => b.name)).toEqual(['GRII Bandung', 'GRII Jakarta']);
		const key = JSON.parse(Buffer.from(first.nextCursor!, 'base64url').toString());
		const second = await asStaff('superadmin', null, () =>
			searchBranches({ q: 'grii', cursor: key, limit: 2 })
		);
		expect(second.items.map((b) => b.name)).toEqual(['GRII Kelapa Gading']);
		expect(second.nextCursor).toBeNull();
	});

	it('shows a branch admin only their own branch', async () => {
		const { items } = await asStaff('branch_admin', jakarta.id, () =>
			searchBranches({ q: '', cursor: null, limit: 50 })
		);
		expect(items.map((b) => b.code)).toEqual(['JKT']);
	});
});
