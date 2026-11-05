import { test, expect } from '@playwright/test';
import { signIn } from '../../login/sign-in';
import { branchByCode, ensureStaff, sql, uniq } from '../../../../e2e-db';

const ADMIN = 'e2e-members@grii.test';
const PASTOR = 'e2e-members-pastor@grii.test';

test.beforeAll(async () => {
	await ensureStaff(ADMIN, 'branch_admin');
	await ensureStaff(PASTOR, 'pastor');
});

// A member of JKT who has died, under a name no other test uses.
async function deceasedMember(): Promise<string> {
	const jkt = await branchByCode('JKT');
	const name = `Late ${uniq()}`;
	const [household] = await sql`insert into households default values returning id`;
	await sql`
		insert into people (member_code, full_name, sex, birth_date, home_branch_id, household_id,
			address_line, city_id, deceased_on)
		select ${'E2E-' + uniq()}, ${name}, 'male', '1930-01-01', id, ${household.id},
			'Jl. Uji 4', city_id, '2026-01-01'
		from branches where id = ${jkt.id}`;
	return name;
}

test('a branch admin browses, searches, and exports members', async ({ page }) => {
	await signIn(page, ADMIN);
	await page.goto('/dashboard');
	await page
		.getByRole('navigation', { name: 'Main' })
		.getByRole('link', { name: 'Members' })
		.click();
	await expect(page.getByRole('heading', { level: 1, name: 'Members' })).toBeVisible();
	await expect(page.getByText(/Total: \d+/)).toBeVisible();
	await expect(page.getByRole('link', { name: 'Active' })).toHaveAttribute('aria-current', 'page');
	const budi = page.getByRole('link', { name: /Budi/ }).first();
	await expect(budi).toBeVisible();

	await page.getByLabel('Search name or Member ID').fill('udi');
	await expect(page).toHaveURL(/q=udi/);
	await expect(budi).toBeVisible();

	const download = page.waitForEvent('download');
	await page.getByRole('link', { name: 'Export' }).click();
	expect((await download).suggestedFilename()).toMatch(/^members-\d{4}-\d{2}-\d{2}\.xlsx$/);
});

test('the deceased tab shows only deceased members and offers no export', async ({ page }) => {
	const name = await deceasedMember();
	await signIn(page, ADMIN);
	// Searched by name: earlier runs leave many deceased test people, and only visible rows render.
	await page.goto(`/members?status=deceased&q=${encodeURIComponent(name)}`);
	await expect(page.getByRole('link', { name })).toBeVisible();
	await page.goto('/members?status=deceased&q=Budi');
	await expect(page.getByRole('link', { name: /Budi/ })).toHaveCount(0);
	await expect(page.getByRole('link', { name: 'Export' })).toHaveCount(0);
});

test('a pastor sees members but cannot export', async ({ page }) => {
	await signIn(page, PASTOR);
	await page.goto('/members');
	await expect(page.getByRole('heading', { level: 1, name: 'Members' })).toBeVisible();
	await expect(page.getByRole('link', { name: 'Export' })).toHaveCount(0);
});

test('a search with no match shows the empty state', async ({ page }) => {
	await signIn(page, ADMIN);
	await page.goto(`/members?q=${uniq()}zzz`);
	await expect(page.getByText('No members match these filters.')).toBeVisible();
});

test('on a phone, rows wrap to two lines and nothing scrolls sideways', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await signIn(page, ADMIN);
	await page.goto('/members');
	await expect(page.getByRole('link', { name: /Budi/ }).first()).toBeVisible();
	const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
	expect(overflow).toBe(false);
});
