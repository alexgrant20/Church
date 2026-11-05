import { test, expect } from '@playwright/test';
import { signIn } from '../../../login/sign-in';
import { e2eFamily } from '../../../../../e2e-db';

const row = (page: import('@playwright/test').Page, name: string) =>
	page.getByRole('listitem').filter({ hasText: name });

test('a member moves their grown child out', async ({ page }) => {
	const fam = await e2eFamily();
	await signIn(page, fam.adultEmail);
	await page.goto('/profile');
	await page.getByRole('link', { name: 'My household' }).click();
	for (const name of Object.values(fam.names)) await expect(row(page, name)).toBeVisible();
	await page.getByRole('link', { name: `Move out: ${fam.names.child}` }).click();
	await expect(page.getByRole('heading', { level: 1 })).toContainText(fam.names.child);
	await expect(page.getByLabel('Street address')).toHaveValue('Jl. Uji 5');
	await page.getByLabel('Street address').fill('Jl. Baru 7');
	await page.getByRole('button', { name: 'Move out' }).click();
	await expect(page.getByText('Moved out. They now have a household of their own.')).toBeVisible();
	await expect(row(page, fam.names.child)).toHaveCount(0);
});

test('a member records a death with a confirmation naming the person', async ({ page }) => {
	const fam = await e2eFamily();
	await signIn(page, fam.adultEmail);
	await page.goto('/profile/household');
	await page.getByRole('link', { name: `Passed away: ${fam.names.spouse}` }).click();
	await page.getByLabel('Date of death').fill('2026-10-01');
	await page.getByRole('button', { name: 'Record as passed away' }).click();
	const dialog = page.getByRole('alertdialog');
	await expect(dialog).toContainText(`Record ${fam.names.spouse} as passed away?`);
	await dialog.getByRole('button', { name: 'Record as passed away' }).click();
	await expect(page.getByText('Recorded as passed away.')).toBeVisible();
	await expect(row(page, fam.names.spouse)).toContainText('Deceased');
});

test('a refused death date is shown, not hidden behind the confirmation', async ({ page }) => {
	const fam = await e2eFamily();
	await signIn(page, fam.adultEmail);
	await page.goto(`/profile/household/${fam.spouse}/passed-away`);
	await page.getByLabel('Date of death').fill('1950-01-01');
	await page.getByRole('button', { name: 'Record as passed away' }).click();
	await page
		.getByRole('alertdialog')
		.getByRole('button', { name: 'Record as passed away' })
		.click();
	await expect(page.getByRole('alert')).toHaveText('The date is before their birth date.');
	await expect(page.getByRole('alertdialog')).toBeHidden();
});

test("a member records their grown child's marriage", async ({ page }) => {
	const fam = await e2eFamily();
	await signIn(page, fam.adultEmail);
	await page.goto('/profile/household');
	await page.getByRole('link', { name: `Got married: ${fam.names.child}` }).click();
	await expect(page.getByText('Step 1 of 2')).toBeVisible();
	await page.getByLabel('Full name').fill(`Spouse of ${fam.names.child}`);
	await page.getByLabel('Nickname').fill('Spouse');
	await page.getByLabel('Female').check();
	await page.getByLabel('Birth date').fill('1998-02-02');
	await page.getByLabel('Wedding date').fill('2026-06-01');
	await page.getByRole('button', { name: 'Next' }).click();
	await expect(page.getByText('Step 2 of 2')).toBeVisible();
	await expect(page.getByLabel('Street address')).toHaveValue('Jl. Uji 5');
	await page.getByRole('button', { name: 'Record the marriage' }).click();
	await expect(page.getByText('Recorded the marriage.')).toBeVisible();
	await expect(row(page, fam.names.child)).toHaveCount(0);
});
