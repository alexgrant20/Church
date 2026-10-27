// Needs the dev database migrated and seeded (`bun run db:migrate && bun run db:seed`).
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
	await page.goto('/login');
	await page.getByLabel('Email or phone').fill('budi@grii.test');
	await page.getByLabel('Password').fill('devpassword123');
	await page.getByRole('button', { name: 'Sign in' }).click();
	await page.waitForURL('**/profile');
});

test('member profile uses 18px body text and 48px tap targets', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto('/profile');
	await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
	const size = await page.evaluate(
		() => getComputedStyle(document.querySelector('main p')!).fontSize
	);
	expect(size).toBe('18px');
	const me = page.getByRole('link', { name: 'Me' });
	expect((await me.boundingBox())!.height).toBeGreaterThanOrEqual(48);
});
test('top bar holds the theme switch with 48px targets', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto('/profile');
	const theme = page.getByRole('banner').getByRole('button', { name: 'Dark' });
	await expect(theme).toBeVisible();
	expect((await theme.boundingBox())!.height).toBeGreaterThanOrEqual(48);
	await theme.click();
	await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
	const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
	expect(overflow).toBe(false);
});
