import { test, expect } from '@playwright/test';
import { signIn } from '../../login/sign-in';
import {
	branchByCode,
	encryptNik,
	ensureStaff,
	insertConsent,
	insertRegistration,
	memberOf,
	uniq
} from '../../../../e2e-db';

const DAY = 24 * 60 * 60 * 1000;
const REVIEWER = 'e2e-queue@grii.test';

test.beforeAll(() => ensureStaff(REVIEWER, 'branch_admin'));

test('the queue scrolls past 50 rows and loads the next page once', async ({ page }) => {
	const jkt = await branchByCode('JKT');
	const tag = uniq();
	// A day old, so these sort ahead of anything other tests add during the run.
	const start = Date.now() - DAY;
	for (let i = 1; i <= 60; i++) {
		await insertRegistration(jkt.id, {
			people: [{ fullName: `Queue ${tag} ${String(i).padStart(2, '0')}` }],
			submittedAt: new Date(start + i * 1000)
		});
	}
	const cursorRequests: string[] = [];
	page.on('request', (r) => {
		if (r.url().includes('/api/registrations') && r.url().includes('cursor=')) {
			cursorRequests.push(r.url());
		}
	});
	await signIn(page, REVIEWER);
	await page.goto('/dashboard');
	const nav = page.getByRole('navigation', { name: 'Main' }).getByRole('link', {
		name: /Registrations/
	});
	await expect(nav).toContainText(/\d+/);
	await nav.click();
	await expect(page.getByRole('heading', { level: 1, name: 'Registrations' })).toBeVisible();
	await expect(page.getByRole('link', { name: 'Pending' })).toHaveAttribute('aria-current', 'page');
	await expect(page.getByRole('link', { name: 'Needs fix' })).toBeVisible();
	await expect(page.getByRole('link', { name: 'Registration link' })).toBeVisible();
	await expect(page.getByText(`Queue ${tag} 01`)).toBeVisible();

	const table = page.getByRole('table');
	for (let i = 0; i < 12 && !(await page.getByText(`Queue ${tag} 60`).isVisible()); i++) {
		await table.evaluate((el) => el.scrollBy(0, 2000));
		await page.waitForTimeout(150);
	}
	await expect(page.getByText(`Queue ${tag} 60`)).toBeVisible();
	await table.evaluate((el) => el.scrollBy(0, 4000));
	await page.waitForTimeout(500);
	expect(cursorRequests).toHaveLength(1);
});

test('a registration shows its people, consent and warnings', async ({ page }) => {
	const jkt = await branchByCode('JKT');
	const member = await memberOf(jkt.id);
	const tag = uniq();
	const reg = await insertRegistration(jkt.id, {
		people: [
			{ fullName: `Detail ${tag}`, extra: { nikEncrypted: encryptNik('3174012345678901') } },
			{ fullName: member.fullName, birthDate: member.birthDate }
		]
	});
	await insertConsent(reg.id, 1, member.id, `t-${uniq()}`);
	await signIn(page, REVIEWER);
	await page.goto(`/registrations/${reg.id}`);
	await expect(page.getByRole('heading', { level: 1, name: `Detail ${tag}` })).toBeVisible();
	await expect(page.getByText('2 people')).toBeVisible();
	await expect(page.getByText('3174••••••••8901').filter({ visible: true })).toBeVisible();
	await expect(page.getByText('Waiting for consent')).toBeVisible();
	await expect(
		page.getByText(new RegExp(`Same name and birth date as ${member.memberCode}`))
	).toBeVisible();
});

test('the queue fits a phone without sideways scroll', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await signIn(page, REVIEWER);
	await page.goto('/registrations');
	await expect(page.getByRole('heading', { level: 1, name: 'Registrations' })).toBeVisible();
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
		true
	);
});
