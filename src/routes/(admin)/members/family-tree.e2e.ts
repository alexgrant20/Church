import { test, expect } from '@playwright/test';
import { signIn } from '../../login/sign-in';
import { ensureStaff, sql } from '../../../../e2e-db';

const ADMIN = 'e2e-family-tree@grii.test';
const KEY = 'membership.family_tree_enabled';

test.beforeAll(() => ensureStaff(ADMIN, 'branch_admin'));

async function budiId(): Promise<string> {
	const [row] = await sql`select id from people where full_name ilike 'Budi%'
		and deleted_at is null order by created_at limit 1`;
	return row.id;
}

const setTree = (on: boolean) => sql`
	insert into system_settings (key, value) values (${KEY}, ${sql.json(on)})
	on conflict (key) do update set value = excluded.value`;

test("a branch admin opens Budi's tree", async ({ page }) => {
	await signIn(page, ADMIN);
	await page.goto(`/members/${await budiId()}`);
	await page.getByRole('link', { name: 'Family tree' }).click();
	await expect(page.getByRole('heading', { level: 1, name: 'Family tree' })).toBeVisible();
	await expect(page.getByText(/^Budi/).first()).toBeVisible();
	await expect(page.locator('[aria-current="true"]')).toContainText('Budi');
	await expect(page.getByRole('link', { name: /^Sari/ })).toBeVisible();
});

test('the tree link and URL disappear when switched off', async ({ page }) => {
	const id = await budiId();
	await setTree(false);
	try {
		await signIn(page, ADMIN);
		await page.goto(`/members/${id}`);
		await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
		await expect(page.getByRole('link', { name: 'Family tree' })).toHaveCount(0);
		const res = await page.goto(`/members/${id}/tree`);
		expect(res?.status()).toBe(404);
	} finally {
		await setTree(true);
	}
});
