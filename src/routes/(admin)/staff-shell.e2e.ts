// Needs the dev database migrated and seeded (`bun run db:migrate && bun run db:seed`):
// the e2e server signs in as the seeded staff account.
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
	await page.goto('/login');
	await page.getByLabel('Email or phone').fill('admin@grii.test');
	await page.getByLabel('Password').fill('devpassword123');
	await page.getByRole('button', { name: 'Sign in' }).click();
	await page.waitForURL('**/dashboard');
});

test('desktop shows the 228px sidebar with the logo tile and nav', async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await page.goto('/branches');
	const sidebar = page.getByRole('navigation', { name: 'Main' });
	await expect(sidebar).toBeVisible();
	expect((await sidebar.boundingBox())!.width).toBe(228);
	// The phone top bar carries its own (hidden) logo; only the visible one counts.
	await expect(page.getByAltText('GRII').locator('visible=true')).toBeVisible();
	await expect(page.getByRole('link', { name: 'Branches' })).toHaveAttribute(
		'aria-current',
		'page'
	);
});
test('phone hides the sidebar behind a labelled menu button and never scrolls sideways', async ({
	page
}) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto('/branches');
	await expect(page.getByRole('navigation', { name: 'Main' })).toBeHidden();
	await page.getByRole('button', { name: 'Menu' }).click();
	await expect(page.getByRole('dialog').getByRole('link', { name: 'Branches' })).toBeVisible();
	const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
	expect(overflow).toBe(false);
});
test('branch list shows the seeded branches by code and name', async ({ page }) => {
	await page.goto('/branches');
	await expect(page.getByRole('heading', { level: 1, name: 'Branches' })).toBeVisible();
	await expect(page.getByRole('row', { name: /JKT.*GRII Pusat/ })).toBeVisible();
});
