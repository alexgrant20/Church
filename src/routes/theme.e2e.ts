import { test, expect } from '@playwright/test';

test.describe('theme', () => {
	test('follows the OS when no cookie is set', async ({ browser }) => {
		const page = await (await browser.newContext({ colorScheme: 'dark' })).newPage();
		await page.goto('/login');
		await expect(page.locator('html')).not.toHaveAttribute('data-theme');
		const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
		expect(bg).toBe('rgb(15, 15, 15)'); // --ground dark #0f0f0f
	});
	test('renders dark from the cookie in the first HTML byte', async ({ request }) => {
		const res = await request.get('/login', { headers: { cookie: 'theme=dark' } });
		expect(await res.text()).toMatch(/<html[^>]*data-theme="dark"/);
	});
	test('a light cookie overrides a dark OS', async ({ browser }) => {
		const ctx = await browser.newContext({ colorScheme: 'dark' });
		await ctx.addCookies([{ name: 'theme', value: 'light', url: 'http://localhost:4173' }]);
		const page = await ctx.newPage();
		await page.goto('/login');
		const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
		expect(bg).toBe('rgb(248, 246, 245)'); // --ground light #f8f6f5
	});
});
