import { test, expect } from '@playwright/test';
import { signIn } from '../../login/sign-in';
import { ensureStaff, sql } from '../../../../e2e-db';

const SUPERADMIN = 'e2e-settings@grii.test';
const ADMIN = 'e2e-settings-admin@grii.test';
const KEY = 'membership.family_tree_enabled';

// Every test here changes the same church-wide switch, so they must not overlap.
test.describe.configure({ mode: 'serial' });

const setTree = (on: boolean) => sql`
	insert into system_settings (key, value) values (${KEY}, ${sql.json(on)})
	on conflict (key) do update set value = excluded.value`;

test.beforeAll(async () => {
	await ensureStaff(SUPERADMIN, 'superadmin');
	await ensureStaff(ADMIN, 'branch_admin');
});

test('a superadmin turns the family tree off and on', async ({ page }) => {
	await signIn(page, SUPERADMIN);
	await page.goto('/settings');
	const panel = page.getByRole('group', { name: 'Allow the family tree' });
	await panel.getByLabel('No').check();
	await page.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByText('Saved')).toBeVisible();
	await page.reload();
	await expect(
		page.getByRole('group', { name: 'Allow the family tree' }).getByLabel('No')
	).toBeChecked();
	await page.getByRole('group', { name: 'Allow the family tree' }).getByLabel('Yes').check();
	await page.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByText('Saved')).toBeVisible();
});

test('a branch admin gets 403 and sees no Settings item', async ({ page }) => {
	await signIn(page, ADMIN);
	const res = await page.goto('/settings');
	expect(res?.status()).toBe(403);
	await page.goto('/dashboard');
	await expect(page.getByRole('link', { name: 'Settings' })).toHaveCount(0);
});

test('the tree link and URL disappear when switched off', async ({ page }) => {
	const [budi] = await sql`select id from people where full_name ilike 'Budi%'
		and deleted_at is null order by created_at limit 1`;
	await setTree(false);
	try {
		await signIn(page, ADMIN);
		await page.goto(`/members/${budi.id}`);
		await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
		await expect(page.getByRole('link', { name: 'Family tree' })).toHaveCount(0);
		const res = await page.goto(`/members/${budi.id}/tree`);
		expect(res?.status()).toBe(404);
	} finally {
		await setTree(true);
	}
});
