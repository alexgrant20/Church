import { test, expect } from '@playwright/test';
import { signIn } from '../../login/sign-in';
import { ensureStaff } from '../../../../e2e-db';

const SUPERADMIN = 'e2e-settings@grii.test';
const ADMIN = 'e2e-settings-admin@grii.test';

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
