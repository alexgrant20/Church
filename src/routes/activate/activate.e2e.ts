import { test, expect } from '@playwright/test';
import { latestCode, signIn } from '../login/sign-in';

test('an invited member activates the account and signs in with the new password', async ({
	page
}) => {
	const identifier = 'sari@grii.test';
	const before = latestCode(identifier);
	await page.goto('/login');
	await page.getByRole('link', { name: 'Activate your account' }).click();
	await page.getByLabel('Email or phone').fill(identifier);
	await page.getByRole('button', { name: 'Send code' }).click();
	await page.waitForURL('**/activate/verify');
	await expect(page.getByText("If this can be activated, we've sent a code.")).toBeVisible();
	await expect.poll(() => latestCode(identifier)).not.toBe(before);

	await page.getByLabel('6-digit code').fill(latestCode(identifier)!);
	await page.getByLabel('New password').fill('brand-new-pass-1');
	await expect(page.getByText('At least 8 characters')).toBeVisible();
	await page.getByRole('button', { name: 'Verify' }).click();

	await page.waitForURL('**/login?activated=1');
	await expect(page.getByText('Your account is active.')).toBeVisible();
	await signIn(page, identifier, 'brand-new-pass-1');
});
