import { test, expect, type Page } from '@playwright/test';
import { e2eBranch, freshLink, uniq } from '../../../e2e-db';

let token: string;

test.beforeAll(async () => {
	token = await freshLink((await e2eBranch()).id);
});

test.use({ viewport: { width: 390, height: 844 } });

async function pickCity(page: Page, label: string) {
	await page.getByRole('combobox', { name: label, exact: true }).click();
	await page.keyboard.type('jakarta');
	await expect(
		page.getByRole('listbox', { name: label, exact: true }).getByRole('option').first()
	).toBeVisible();
	await page.keyboard.press('ArrowDown');
	await page.keyboard.press('Enter');
}

type PersonInput = { name: string; relation?: string; email?: string; phone?: string };

async function fillPerson(page: Page, p: PersonInput, withAddress: boolean) {
	if (p.relation) await page.getByLabel('Relation to you').selectOption({ label: p.relation });
	await page.getByLabel('Full name').fill(p.name);
	await page.getByLabel('Nickname').fill(p.name.split(' ')[0]);
	await page.getByRole('radio', { name: 'Female' }).check();
	await page.getByLabel('Birth date').fill('1990-05-01');
	await pickCity(page, 'Birth city');
	if (p.email) await page.getByLabel('Email').fill(p.email);
	if (p.phone) await page.getByLabel('Phone').fill(p.phone);
	if (withAddress) {
		await page.getByLabel('Street address').fill('Jl. Mawar 1');
		await page.getByLabel('Postal code').fill('12345');
		await pickCity(page, 'City');
	}
	await page.getByLabel('Occupation').selectOption({ label: 'Employee' });
	await page.getByLabel('Education').selectOption({ label: "Bachelor's degree" });
	await page.getByLabel('No previous church').check();
	await page.getByRole('group', { name: 'Baptized' }).getByRole('radio', { name: 'No' }).check();
	await page
		.getByRole('group', { name: 'Confirmed (sidi)' })
		.getByRole('radio', { name: 'No' })
		.check();
}

async function addPerson(page: Page, p: PersonInput) {
	await page.getByRole('button', { name: 'Add person' }).click();
	await fillPerson(page, p, false);
	await page.getByRole('button', { name: 'Done' }).click();
	await expect(page.getByText(p.name)).toBeVisible();
}

async function fillRegistrant(page: Page, p: PersonInput) {
	await page.goto(`/register/${token}`);
	await fillPerson(page, p, true);
	await page.getByRole('group', { name: 'Baptized' }).getByRole('radio', { name: 'Yes' }).check();
	await page.getByLabel('Baptism date').fill('2005-04-01');
	await page.getByLabel('Baptism church').fill('GRII Pusat');
	await page.getByRole('button', { name: 'Next' }).click();
	await expect(page.getByText('Step 2 of 3')).toBeVisible();
}

const enlargeText = (page: Page) =>
	page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
const noSidewaysScroll = (page: Page) =>
	page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

test('a family of 4 registers', async ({ page }) => {
	await fillRegistrant(page, { name: 'Ani Wijaya', email: `ani-${uniq()}@mail.test` });
	await addPerson(page, { name: 'Budi Wijaya', relation: 'Spouse' });
	await addPerson(page, { name: 'Citra Wijaya', relation: 'Child' });
	await addPerson(page, { name: 'Dodi Wijaya', relation: 'Child' });
	await page.getByRole('button', { name: 'Next' }).click();
	await expect(page.getByText('Step 3 of 3')).toBeVisible();
	await page.getByRole('button', { name: 'Send registration' }).click();
	await page.waitForURL(`**/register/${token}/done`);
	await expect(page.getByText('We will review your registration')).toBeVisible();
});

test('the form reflows at 200% text size', async ({ page }) => {
	await page.goto(`/register/${token}`);
	await enlargeText(page);
	expect(await noSidewaysScroll(page)).toBe(true);
	await fillRegistrant(page, { name: 'Eka Putri', phone: `0812${Date.now() % 1e8}` });
	await enlargeText(page);
	await addPerson(page, { name: 'Fajar Putra', relation: 'Spouse' });
	expect(await noSidewaysScroll(page)).toBe(true);
	await page.getByRole('button', { name: 'Next' }).click();
	await expect(page.getByText('Step 3 of 3')).toBeVisible();
	expect(await noSidewaysScroll(page)).toBe(true);
	await page.getByRole('button', { name: 'Back' }).click();
	await page.getByRole('button', { name: 'Edit Fajar Putra' }).click();
	await expect(page.getByLabel('Full name')).toHaveValue('Fajar Putra');
	expect(await noSidewaysScroll(page)).toBe(true);
});

test('a validation error leads back to the field', async ({ page }) => {
	const phone = `0813${Date.now() % 1e8}`;
	await fillRegistrant(page, { name: 'Gita Sari', phone });
	await addPerson(page, { name: 'Hadi Sari', relation: 'Spouse', phone });
	await page.getByRole('button', { name: 'Next' }).click();
	await page.getByRole('button', { name: 'Send registration' }).click();
	await expect(page.getByText('Step 2 of 3')).toBeVisible();
	await expect(page.getByLabel('Full name')).toHaveValue('Hadi Sari');
	await expect(page.getByLabel('Phone')).toBeFocused();
	await expect(page.getByText('Already used for another person on this form.')).toBeVisible();
});

test('an unknown token shows not found', async ({ page }) => {
	const res = await page.goto('/register/not-a-real-token');
	expect(res?.status()).toBe(404);
});

test('the page sets a device cookie', async ({ page }) => {
	await page.goto(`/register/${token}`);
	const cookie = (await page.context().cookies()).find((c) => c.name === 'device_id');
	expect(cookie?.httpOnly).toBe(true);
});
