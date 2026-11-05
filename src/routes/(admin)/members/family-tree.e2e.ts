import { test, expect } from '@playwright/test';
import { signIn } from '../../login/sign-in';
import { ensureStaff, sql } from '../../../../e2e-db';

const ADMIN = 'e2e-family-tree@grii.test';

test.beforeAll(() => ensureStaff(ADMIN, 'branch_admin'));

async function budiId(): Promise<string> {
	const [row] = await sql`select id from people where full_name ilike 'Budi%'
		and deleted_at is null order by created_at limit 1`;
	return row.id;
}

test("a branch admin opens Budi's tree", async ({ page }) => {
	await signIn(page, ADMIN);
	await page.goto(`/members/${await budiId()}`);
	await page.getByRole('link', { name: 'Family tree' }).click();
	await expect(page.getByRole('heading', { level: 1, name: 'Family tree' })).toBeVisible();
	await expect(page.getByText(/^Budi/).first()).toBeVisible();
	await expect(page.locator('[aria-current="true"]')).toContainText('Budi');
	await expect(page.getByRole('link', { name: /^Sari/ })).toBeVisible();
});
