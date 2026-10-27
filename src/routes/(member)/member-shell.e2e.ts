// Needs the dev database migrated and seeded (`bun run db:migrate && bun run db:seed`).
import { test, expect } from '@playwright/test';
import { forgetSession, signIn } from '../login/sign-in';

test.beforeEach(({ page }) => signIn(page, 'budi@grii.test'));

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
test('sign out from the profile ends the session', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	const signOut = page.getByRole('button', { name: 'Sign out' });
	expect((await signOut.boundingBox())!.height).toBeGreaterThanOrEqual(48);
	await signOut.click();
	await page.waitForURL('**/login');
	forgetSession('budi@grii.test');
	await page.goto('/profile');
	await expect(page).toHaveURL(/\/login$/);
});
