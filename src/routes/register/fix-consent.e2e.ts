import { readFileSync, existsSync } from 'node:fs';
import { test, expect, type Page } from '@playwright/test';
import { MESSAGE_LOG_FILE, signIn } from '../login/sign-in';
import {
	branchByCode,
	ensureStaff,
	insertConsent,
	insertRegistration,
	newToken,
	uniq
} from '../../../e2e-db';

const REVIEWER = 'e2e-fix@grii.test';
const MEMBER = 'e2e-consent@grii.test';

let memberId: string;
test.beforeAll(async () => {
	await ensureStaff(REVIEWER, 'branch_admin');
	memberId = await ensureStaff(MEMBER, null);
});

const fixUrlFor = (to: string): string | undefined =>
	existsSync(MESSAGE_LOG_FILE)
		? readFileSync(MESSAGE_LOG_FILE, 'utf8')
				.split('\n')
				.filter(Boolean)
				.map((l) => JSON.parse(l) as { to: string; template: string; params: { fixUrl?: string } })
				.filter((m) => m.to === to && m.template === 'registration_needs_fix')
				.at(-1)?.params.fixUrl
		: undefined;

const noSidewaysScroll = (page: Page) =>
	page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

test('a family fixes and resubmits', async ({ page, browser }) => {
	const jkt = await branchByCode('JKT');
	const name = `Fix ${uniq()}`;
	const reg = await insertRegistration(jkt.id, { people: [{ fullName: name }] });
	await signIn(page, REVIEWER);
	await page.goto(`/registrations/${reg.id}`);
	await page.getByRole('button', { name: 'Needs fix' }).click();
	await page.getByLabel('What needs fixing').fill('Please use your full legal name.');
	await page.getByRole('button', { name: 'Send back' }).click();
	await page.waitForURL('**/registrations');

	await expect.poll(() => fixUrlFor(reg.registrantEmail)).toBeTruthy();
	const fixPath = new URL(fixUrlFor(reg.registrantEmail)!).pathname;
	const family = await (
		await browser.newContext({ viewport: { width: 390, height: 844 } })
	).newPage();
	await family.goto(fixPath);
	await expect(family.getByText('Please use your full legal name.')).toBeVisible();
	await expect(family.getByLabel('Full name')).toHaveValue(name);
	expect(await noSidewaysScroll(family)).toBe(true);
	await family.getByLabel('Full name').fill(`${name} Corrected`);
	await family.getByRole('button', { name: 'Next' }).click();
	await family.getByRole('button', { name: 'Next' }).click();
	await family.getByRole('button', { name: 'Send registration' }).click();
	await family.waitForURL('**/done');
	await expect(family.getByText('We will review your registration')).toBeVisible();

	// Other files fill the queue, so check the row itself: Approve shows only while pending.
	await page.goto(`/registrations/${reg.id}`);
	await expect(page.getByRole('heading', { level: 1, name: `${name} Corrected` })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Approve' })).toBeEnabled();
	const again = await family.goto(fixPath);
	expect(again?.status()).toBe(404);
});

async function consentFor() {
	const jkt = await branchByCode('JKT');
	const name = `Lister ${uniq()}`;
	const reg = await insertRegistration(jkt.id, {
		people: [{ fullName: name }, { fullName: 'E2E consent member' }]
	});
	const token = newToken();
	await insertConsent(reg.id, 1, memberId, token);
	return { reg, name, token };
}

test('a member consents', async ({ page, browser }) => {
	const { reg, name, token } = await consentFor();
	await page.setViewportSize({ width: 390, height: 844 });
	await signIn(page, MEMBER);
	await page.goto(`/consent/${token}`);
	await expect(page.getByText(name)).toBeVisible();
	expect(await noSidewaysScroll(page)).toBe(true);
	const yes = page.getByRole('button', { name: "Yes, that's me" });
	expect((await yes.boundingBox())?.height).toBeGreaterThanOrEqual(56);
	await yes.click();
	await expect(
		page.getByText('Thank you. The church will link the registration to you.')
	).toBeVisible();

	const staff = await (await browser.newContext()).newPage();
	await signIn(staff, REVIEWER);
	await staff.goto(`/registrations/${reg.id}`);
	await expect(staff.getByText('Consent given')).toBeVisible();
});

test('a stranger cannot open the consent link', async ({ page }) => {
	const { token } = await consentFor();
	await signIn(page, REVIEWER);
	const res = await page.goto(`/consent/${token}`);
	expect(res?.status()).toBe(404);
});
