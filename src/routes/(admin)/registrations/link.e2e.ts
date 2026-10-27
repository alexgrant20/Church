import { test, expect, type Page } from '@playwright/test';
import { signIn } from '../../login/sign-in';
import { ensureStaff } from '../../../../e2e-db';

const ADMIN = 'e2e-link@grii.test';
const SUPER = 'e2e-link-super@grii.test';

test.beforeAll(async () => {
	await ensureStaff(ADMIN, 'branch_admin');
	await ensureStaff(SUPER, 'superadmin');
});

test('a branch admin sees, copies and replaces the branch link', async ({ page, context }) => {
	await context.grantPermissions(['clipboard-read', 'clipboard-write']);
	await signIn(page, ADMIN);
	await page.goto('/registrations/link');
	await expect(page.getByRole('heading', { level: 1, name: 'Registration link' })).toBeVisible();
	const url = page.getByTestId('registration-url');
	await expect(url).toContainText('/register/');
	const before = await url.textContent();
	const qr = page.getByRole('img', { name: 'QR code for the registration link' });
	await expect(qr).toBeVisible();
	expect((await qr.boundingBox())?.width).toBe(240);

	await page.getByRole('button', { name: 'Copy link' }).click();
	await expect(page.getByText('Link copied')).toBeVisible();

	await page.getByRole('button', { name: 'Replace link' }).click();
	const dialog = page.getByRole('alertdialog');
	await expect(dialog).toContainText('printed QR');
	await dialog.getByRole('button', { name: 'Replace link' }).click();
	await expect(url).not.toHaveText(before!);
	await expect(url).toContainText('/register/');
});

async function chooseBranch(page: Page, text: string) {
	await page.getByRole('combobox', { name: 'Branch' }).click();
	await page.keyboard.type(text);
	await expect(
		page.getByRole('listbox', { name: 'Branch' }).getByRole('option', { name: new RegExp(text) })
	).toBeVisible();
	await page.keyboard.press('ArrowDown');
	await page.keyboard.press('Enter');
}

test('a superadmin chooses a branch, then switches branch', async ({ page }) => {
	await signIn(page, SUPER);
	await page.goto('/registrations/link');
	await expect(page.getByText('Choose a branch to see its registration link.')).toBeVisible();
	const url = page.getByTestId('registration-url');
	await chooseBranch(page, 'Pusat');
	await expect(url).toContainText('/register/');
	const before = await url.textContent();
	await chooseBranch(page, 'Kelapa');
	await expect(url).not.toHaveText(before!);
	await expect(page.getByRole('combobox', { name: 'Branch' })).toHaveValue(/Kelapa Gading/);
});
