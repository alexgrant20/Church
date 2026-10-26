import { test, expect } from '@playwright/test';

test('manifest is linked and served', async ({ page, request }) => {
	await page.goto('/login');
	await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
		'href',
		/manifest\.webmanifest$/
	);
	const res = await request.get('/manifest.webmanifest');
	expect(res.ok()).toBe(true);
	expect((await res.json()).display).toBe('standalone');
});

test('shows the offline page when the network is down', async ({ page, context }) => {
	await page.goto('/login');
	await page.evaluate(() => navigator.serviceWorker.ready);
	await page.reload(); // let the active worker take control of the page

	await context.setOffline(true);
	await page.goto('/login');
	await expect(page.getByRole('heading', { name: 'You are offline' })).toBeVisible();
});
