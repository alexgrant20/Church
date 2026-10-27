import { readFileSync, existsSync } from 'node:fs';
import { test, expect, type Page } from '@playwright/test';
import { MESSAGE_LOG_FILE, signIn } from '../../login/sign-in';
import {
	branchByCode,
	ensureStaff,
	insertConsent,
	insertRegistration,
	memberOf,
	uniq
} from '../../../../e2e-db';

const REVIEWER = 'e2e-decide@grii.test';

test.beforeAll(() => ensureStaff(REVIEWER, 'branch_admin'));

type Logged = { to: string; template: string; params: Record<string, string> };
const messagesTo = (to: string): Logged[] =>
	existsSync(MESSAGE_LOG_FILE)
		? readFileSync(MESSAGE_LOG_FILE, 'utf8')
				.split('\n')
				.filter(Boolean)
				.map((l) => JSON.parse(l) as Logged)
				.filter((msg) => msg.to === to)
		: [];

async function openNew(page: Page, people = 1) {
	const jkt = await branchByCode('JKT');
	const tag = uniq();
	const reg = await insertRegistration(jkt.id, {
		people: Array.from({ length: people }, (_, i) => ({ fullName: `Decide ${tag} ${i}` }))
	});
	await signIn(page, REVIEWER);
	await page.goto(`/registrations/${reg.id}`);
	return { ...reg, name: `Decide ${tag} 0` };
}

test('approve creates the household', async ({ page }) => {
	const reg = await openNew(page, 2);
	await page.getByRole('button', { name: 'Approve' }).click();
	await expect(page.getByText('Registration approved')).toHaveCount(1);
	await page.waitForURL('**/registrations');
	await expect(page.getByText(reg.name)).toHaveCount(0);
	await expect
		.poll(() => messagesTo(reg.registrantEmail).map((msg) => msg.template))
		.toContain('registration_approved');
});

test('double-tapping Approve sends one request', async ({ page }) => {
	await openNew(page);
	let posts = 0;
	page.on('request', (r) => {
		if (r.method() === 'POST' && r.url().includes('approve')) posts++;
	});
	await page.getByRole('button', { name: 'Approve' }).dblclick();
	await page.waitForURL('**/registrations');
	await expect(page.getByText('Registration approved')).toHaveCount(1);
	expect(posts).toBe(1);
});

test('needs fix requires a reason', async ({ page }) => {
	const reg = await openNew(page);
	await page.getByRole('button', { name: 'Needs fix' }).click();
	const dialog = page.getByRole('dialog');
	await dialog.getByRole('button', { name: 'Send back' }).click();
	await expect(dialog.getByText('This field is required.')).toBeVisible();
	await dialog.getByLabel('What needs fixing').fill('Please add your birth city.');
	await dialog.getByRole('button', { name: 'Send back' }).click();
	await page.waitForURL('**/registrations');
	await expect
		.poll(() => messagesTo(reg.registrantEmail).map((msg) => msg.template))
		.toContain('registration_needs_fix');
});

test('spam asks first', async ({ page }) => {
	const reg = await openNew(page);
	await page.getByRole('button', { name: 'Spam' }).click();
	const dialog = page.getByRole('alertdialog');
	await expect(dialog).toContainText(reg.name);
	await dialog.getByRole('button', { name: 'Mark as spam' }).click();
	await page.waitForURL('**/registrations');
	await expect(page.getByText(reg.name)).toHaveCount(0);
	expect(messagesTo(reg.registrantEmail)).toHaveLength(0);
});

test('approve waits for consent, and an in-person consent unblocks it', async ({ page }) => {
	const jkt = await branchByCode('JKT');
	const member = await memberOf(jkt.id);
	const reg = await insertRegistration(jkt.id, {
		people: [{ fullName: `Consent ${uniq()}` }, { fullName: 'Listed Member' }]
	});
	await insertConsent(reg.id, 1, member.id, null);
	await signIn(page, REVIEWER);
	await page.goto(`/registrations/${reg.id}`);
	await expect(page.getByRole('button', { name: 'Approve' })).toBeDisabled();
	await expect(page.getByText('Approve after every listed member has consented.')).toBeVisible();
	await page.getByRole('button', { name: 'Recorded in person' }).click();
	await expect(page.getByText('Consent given')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Approve' })).toBeEnabled();
});

test('a warning can send a consent request', async ({ page }) => {
	const jkt = await branchByCode('JKT');
	const reg = await insertRegistration(jkt.id, {
		people: [{ fullName: `Warn ${uniq()}` }, { fullName: 'Budi Santoso', birthDate: '1980-04-12' }]
	});
	const before = messagesTo('budi@grii.test').length;
	await signIn(page, REVIEWER);
	await page.goto(`/registrations/${reg.id}`);
	await page.getByRole('button', { name: /Ask .* to consent/ }).click();
	await expect(page.getByText('Waiting for consent')).toBeVisible();
	await expect.poll(() => messagesTo('budi@grii.test').length).toBeGreaterThan(before);
	expect(messagesTo('budi@grii.test').at(-1)?.template).toBe('consent_request');
});
