import { test, expect } from '@playwright/test';

test('login shows the logo on the brand panel and labelled fields', async ({ page }) => {
	await page.goto('/login');
	await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
	await expect(page.getByAltText('GRII')).toBeVisible();
	await expect(page.getByLabel('Email or phone')).toBeVisible();
	await expect(page.getByLabel('Password')).toBeVisible();
});

test('a wrong password shows the error inside the form, not a browser dialog', async ({ page }) => {
	page.on('dialog', () => {
		throw new Error('browser dialog opened');
	});
	await page.goto('/login');
	await page.getByLabel('Email or phone').fill('admin@grii.test');
	await page.getByLabel('Password').fill('wrong-password');
	await page.getByRole('button', { name: 'Sign in' }).click();
	await expect(page.getByRole('alert')).toHaveText('Invalid email, phone, or password.');
});
