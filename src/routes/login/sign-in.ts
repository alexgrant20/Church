import { existsSync, mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { expect, type Page } from '@playwright/test';

export const MESSAGE_LOG_FILE = 'test-results/messages.jsonl';
const sessionFile = (identifier: string) => `test-results/session-${identifier}.json`;

export function latestCode(to: string): string | undefined {
	if (!existsSync(MESSAGE_LOG_FILE)) return undefined;
	const lines = readFileSync(MESSAGE_LOG_FILE, 'utf8').split('\n').filter(Boolean);
	const messages = lines.map((l) => JSON.parse(l) as { to: string; params: { code: string } });
	return messages.filter((m) => m.to === to).at(-1)?.params.code;
}

// A person gets one login code per minute, so each identifier signs in through the form once
// per run and later calls reuse that session.
export async function signIn(page: Page, identifier: string, password = 'devpassword123') {
	if (existsSync(sessionFile(identifier))) {
		await page.context().addCookies(JSON.parse(readFileSync(sessionFile(identifier), 'utf8')));
		await page.goto('/');
		return;
	}
	const before = latestCode(identifier);
	await page.goto('/login');
	await page.getByLabel('Email or phone').fill(identifier);
	await page.getByLabel('Password').fill(password);
	await page.getByRole('button', { name: 'Sign in' }).click();
	await page.waitForURL('**/login/verify');
	await expect.poll(() => latestCode(identifier)).not.toBe(before);
	await page.getByLabel('6-digit code').fill(latestCode(identifier)!);
	await page.getByRole('button', { name: 'Verify' }).click();
	await page.waitForURL((url) => !url.pathname.startsWith('/login'));
	mkdirSync('test-results', { recursive: true });
	writeFileSync(sessionFile(identifier), JSON.stringify(await page.context().cookies()));
}

// Signing out revokes the saved session, so a test that signs out must drop it.
export const forgetSession = (identifier: string) =>
	rmSync(sessionFile(identifier), { force: true });
