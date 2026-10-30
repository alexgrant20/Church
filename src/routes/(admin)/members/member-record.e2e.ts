import { test, expect } from '@playwright/test';
import { signIn } from '../../login/sign-in';
import { ensureStaff, sql } from '../../../../e2e-db';

const ADMIN = 'e2e-member-record@grii.test';

test.beforeAll(() => ensureStaff(ADMIN, 'branch_admin'));

async function personId(fullNameLike: string): Promise<string> {
	const [row] = await sql`select id from people where full_name ilike ${fullNameLike + '%'}
		and deleted_at is null order by created_at limit 1`;
	return row.id;
}

test('a branch admin opens Budi and his family', async ({ page }) => {
	await signIn(page, ADMIN);
	await page.goto('/members?q=Budi');
	await page.getByRole('link', { name: /^Budi/ }).first().click();
	await expect(page.getByRole('heading', { level: 1, name: /Budi/ })).toBeVisible();
	await expect(page.getByText(/JKT-\d{4}-\d{5}/).first()).toBeVisible();
	await expect(page.getByText('Personal')).toBeVisible();
	await page.getByRole('link', { name: 'Family' }).click();
	await expect(page.getByText('This household')).toBeVisible();
	await expect(page.getByRole('link', { name: /^Sari/ })).toBeVisible();
	await expect(page.getByRole('link', { name: /^Andi/ })).toBeVisible();
});

test('opening a household member from another branch is view-only and audited', async ({
	page
}) => {
	const sari = await personId('Sari');
	const before = await sql`select count(*)::int as n from audit_logs
		where action = 'person.viewed_cross_branch' and entity_id = ${sari}`;
	await signIn(page, ADMIN);
	await page.goto(`/members/${sari}`);
	await expect(page.getByText('View only')).toBeVisible();
	const after = await sql`select count(*)::int as n from audit_logs
		where action = 'person.viewed_cross_branch' and entity_id = ${sari}`;
	expect(after[0].n).toBe(before[0].n + 1);
});

test('an unknown member id shows not found', async ({ page }) => {
	await signIn(page, ADMIN);
	const res = await page.goto('/members/01900000-0000-7000-8000-000000000000');
	expect(res?.status()).toBe(404);
});

test('on a phone the record does not scroll sideways', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await signIn(page, ADMIN);
	await page.goto(`/members/${await personId('Budi')}`);
	const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
	expect(overflow).toBe(false);
});
