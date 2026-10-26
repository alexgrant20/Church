import { test, expect } from '@playwright/test';

test.describe('locale', () => {
	test('defaults to English', async ({ page }) => {
		await page.goto('/login');
		await expect(page.locator('html')).toHaveAttribute('lang', 'en');
	});
	for (const locale of ['id', 'zh-Hans', 'zh-Hant']) {
		test(`sets lang to ${locale} from the cookie`, async ({ page, context }) => {
			await context.addCookies([
				{ name: 'PARAGLIDE_LOCALE', value: locale, url: 'http://localhost:4173' }
			]);
			await page.goto('/login');
			await expect(page.locator('html')).toHaveAttribute('lang', locale);
		});
	}
});
