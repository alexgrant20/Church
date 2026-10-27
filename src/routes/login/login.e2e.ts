import { test, expect } from '@playwright/test';
import { latestCode } from './sign-in';

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

// One code per person per minute, so the wrong-code and right-code steps share one login.
test('a wrong code is refused, then the emailed code opens the session', async ({ page }) => {
	const identifier = 'rina@grii.test';
	const before = latestCode(identifier);
	await page.goto('/login');
	await page.getByLabel('Email or phone').fill(identifier);
	await page.getByLabel('Password').fill('devpassword123');
	await page.getByRole('button', { name: 'Sign in' }).click();
	await page.waitForURL('**/login/verify');
	await expect.poll(() => latestCode(identifier)).not.toBe(before);
	const code = latestCode(identifier)!;

	await page.getByLabel('6-digit code').fill(code === '000000' ? '111111' : '000000');
	await page.getByRole('button', { name: 'Verify' }).click();
	await expect(page.getByRole('alert')).toHaveText(
		'That code is not valid. Check it and try again.'
	);

	await page.getByLabel('6-digit code').fill(code);
	await page.getByRole('button', { name: 'Verify' }).click();
	await page.waitForURL((url) => !url.pathname.startsWith('/login'));
});

test('the code screen without a login in progress goes back to sign in', async ({ page }) => {
	await page.goto('/login/verify');
	await expect(page).toHaveURL(/\/login$/);
});
