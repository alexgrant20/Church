import { test, expect } from '@playwright/test';
import { signIn } from '../../login/sign-in';
import { e2eFamily, ensureStaff } from '../../../../e2e-db';

const ADMIN = 'e2e-life-admin@grii.test';
const PASTOR = 'e2e-life-pastor@grii.test';

test.beforeAll(async () => {
	await ensureStaff(ADMIN, 'branch_admin');
	await ensureStaff(PASTOR, 'pastor');
});

test('an admin records a death and undoes it', async ({ page }) => {
	const fam = await e2eFamily();
	await signIn(page, ADMIN);
	await page.goto(`/members/${fam.child}`);
	await page.getByRole('button', { name: 'Passed away' }).click();
	const dialog = page.getByRole('dialog');
	await expect(dialog).toContainText(fam.names.child);
	await dialog.getByLabel('Date of death').fill('2026-10-01');
	await dialog.getByRole('button', { name: `Record ${fam.names.child} as passed away` }).click();
	await expect(page.getByText('Saved')).toBeVisible();
	await expect(page.locator('header').getByText('Deceased')).toBeVisible();
	await page.getByRole('button', { name: 'Undo passed away' }).click();
	await page.getByRole('alertdialog').getByRole('button', { name: 'Undo passed away' }).click();
	await expect(page.locator('header').getByText('Deceased')).toHaveCount(0);
});

test('an admin moves an adult out and back', async ({ page }) => {
	const fam = await e2eFamily();
	await signIn(page, ADMIN);
	await page.goto(`/members/${fam.child}`);
	await page.getByRole('button', { name: 'Moved out' }).click();
	const dialog = page.getByRole('dialog');
	await dialog.getByLabel('Street address').fill('Jl. Baru 9');
	await dialog.getByRole('button', { name: 'Move out' }).click();
	await expect(page.getByText('Saved')).toBeVisible();
	await page.getByRole('link', { name: 'Family', exact: true }).click();
	await expect(page.getByRole('link', { name: fam.names.adult })).toHaveCount(0);
	await page.getByRole('button', { name: 'Move back' }).click();
	await page.getByRole('alertdialog').getByRole('button', { name: 'Move back' }).click();
	await expect(page.getByRole('link', { name: fam.names.adult })).toBeVisible();
});

test('a pastor sees no life-change actions', async ({ page }) => {
	const fam = await e2eFamily();
	await signIn(page, PASTOR);
	await page.goto(`/members/${fam.child}`);
	await expect(page.getByRole('heading', { level: 1, name: fam.names.child })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Passed away' })).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Moved out' })).toHaveCount(0);
});
