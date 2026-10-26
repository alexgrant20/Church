# Foundation Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the app its design system (tokens, light and dark theme, type, i18n, shared components) and rebuild the existing screens (login, staff shell, branch list, member shell, profile) on it, using only the backend that already exists.

**Architecture:** Tokens live in `src/routes/layout.css` as CSS custom properties, wired to Tailwind 4 `@theme` and shadcn-svelte variables. The theme comes from a cookie and is rendered on the server. All copy comes from Paraglide messages. shadcn-svelte components are copied into `src/lib/components/ui/`; GRII's own reusable pieces go in `src/lib/components/`. Screens added by later modules (registration, activation, household, OTP) are **not** in this plan; they follow the next backend plan.

**Tech Stack:** SvelteKit 2, Svelte 5 runes, Tailwind 4, shadcn-svelte (Bits UI), svelte-sonner, lucide-svelte, Paraglide JS 2, `@fontsource/ibm-plex-sans` and `@fontsource/ibm-plex-mono`, Vitest browser mode, Playwright.

**Spec:** `DESIGN.md` (shared), `src/routes/(admin)/DESIGN.md`, `src/routes/(member)/DESIGN.md`, `src/lib/components/DESIGN.md`, and `CLAUDE.md` (UI rules). Read the shared file and the folder's file before each task.

## Global Constraints

- Every number in the DESIGN.md files is binding: sizes, radii, widths, breakpoints (phone ≤640px, tablet 641–1099px, desktop ≥1100px).
- Colours only through tokens; never a raw hex in a component. `#8c0001` only in the four places DESIGN.md §2 allows.
- All user-facing text comes from Paraglide messages; base locale `en`; locales `en`, `id`, `zh-Hans`, `zh-Hant`. No hard-coded strings.
- All sizes in `rem`; never a pixel `font-size` on `html`. Layouts reflow at 200% text size.
- Never `alert()`, `confirm()`, `prompt()`. Toasts via svelte-sonner, confirmations via AlertDialog.
- No fake data on any screen. A destination that does not exist yet is not shown.
- Fonts are self-hosted (fontsource); no Google Fonts request, no CJK web font.
- Functions under ~40 lines, files under ~200 lines; English-only code and comments.

## Review Focus

1. Dark theme chosen in a cookie must render dark on the first byte, with no light flash. Test in Task 2.
2. A Chinese locale page must set `lang="zh-Hans"` / `zh-Hant` so the right system CJK face applies. Test in Task 1.
3. Rupiah must print `Rp 1.250.000` in every UI locale, including `en` and `zh`. Test in Task 3.
4. On a 390px phone the staff screens must not scroll sideways, and the sidebar must become a menu sheet. Test in Task 5.
5. Every interactive element shows the 2px focus ring from the keyboard; icon-only buttons have an `aria-label`. Test in Tasks 4 and 5.

---

### Task 1: Paraglide i18n with four locales

**Files:**

- Create: `project.inlang/settings.json`, `messages/en.json`, `messages/id.json`, `messages/zh-Hans.json`, `messages/zh-Hant.json`, `src/hooks.ts`
- Modify: `src/hooks.server.ts`, `src/app.html`, `vite.config.ts`, `package.json`, `.gitignore`
- Test: `src/routes/i18n.e2e.ts`

**Interfaces:**

- Produces: `import { m } from '$lib/paraglide/messages'` and `getLocale()` from `$lib/paraglide/runtime`; every later task adds its keys to all four message files.

- [ ] **Step 1: Install and configure Paraglide**

Run `bunx sv add paraglide` (or install `@inlang/paraglide-js` by hand), then set: `baseLocale: "en"`, `locales: ["en", "id", "zh-Hans", "zh-Hant"]`, Vite plugin `strategy: ['cookie', 'preferredLanguage', 'baseLocale']` (no URL prefixes; the PWA keeps one URL per screen). Generated `src/lib/paraglide/` is gitignored. Compose `paraglideMiddleware` with the existing `handle` via `sequence()`; it replaces `%paraglide.lang%` in `app.html`'s `<html lang>`.

- [ ] **Step 2: Write the failing e2e test**

```ts
test.describe('locale', () => {
	test('defaults to English', async ({ page }) => {
		await page.goto('/login');
		await expect(page.locator('html')).toHaveAttribute('lang', 'en');
	});
	for (const locale of ['id', 'zh-Hans', 'zh-Hant']) {
		test(`sets lang to ${locale} from the cookie`, async ({ page, context }) => {
			await context.addCookies([
				{ name: 'PARAGLIDE_LOCALE', value: locale, url: 'http://localhost:4173' }
			]);
			await page.goto('/login');
			await expect(page.locator('html')).toHaveAttribute('lang', locale);
		});
	}
});
```

Run: `bunx playwright test src/routes/i18n.e2e.ts`
Expected: FAIL (`lang` stays `en`).

- [ ] **Step 3: Move the existing strings into messages**

Every string in `src/routes/**/*.svelte` and every user-facing error in the routes' `fail()` calls becomes a key in `messages/en.json` (keys are snake_case by screen: `login_title`, `login_identifier_label`, `error_invalid_credentials`, ...). Services keep throwing English message keys; the route maps them to `m[...]()` at render time.

- [ ] **Step 4: Fill the other three locales**

Add `"i18n:translate": "bunx @inlang/cli machine translate --project ./project.inlang"` to `package.json` and run it. It fills only missing keys. Church terms stay as names in every locale: Kebaktian, Warta, Persembahan, GRII.

- [ ] **Step 5: Run the test**

Run: `bunx playwright test src/routes/i18n.e2e.ts && bun run check`
Expected: PASS, 4 tests; 0 type errors.

- [ ] **Step 6: Commit**

```bash
git add project.inlang messages src vite.config.ts package.json bun.lock .gitignore
git commit -m "feat(i18n): Paraglide with en, id, zh-Hans, zh-Hant"
```

---

### Task 2: Tokens, fonts, and the light / dark theme

**Files:**

- Modify: `src/routes/layout.css`, `src/app.html`, `src/hooks.server.ts`, `src/app.d.ts`, `package.json`
- Create: `src/lib/server/theme.ts`
- Test: `src/routes/theme.e2e.ts`

**Interfaces:**

- Produces:
  - CSS custom properties exactly as DESIGN.md §2 (light under `:root`, dark under `:root[data-theme="dark"]`, and the same dark values under `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) }` for `system`)
  - Tailwind 4 `@theme` colours named after the tokens (`bg-surface`, `text-muted`, `border-rule`, ...)
  - `type Theme = 'light' | 'dark' | 'system'`; `readTheme(cookies: Cookies): Theme` in `theme.ts` (cookie `theme`, anything else falls back to `system`); `locals.theme: Theme`
  - `<html data-theme="light|dark">` rendered by the server; no attribute for `system`

- [ ] **Step 1: Write the failing e2e test**

```ts
test.describe('theme', () => {
	test('follows the OS when no cookie is set', async ({ browser }) => {
		const page = await (await browser.newContext({ colorScheme: 'dark' })).newPage();
		await page.goto('/login');
		await expect(page.locator('html')).not.toHaveAttribute('data-theme');
		const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
		expect(bg).toBe('rgb(15, 15, 15)'); // --ground dark #0f0f0f
	});
	test('renders dark from the cookie in the first HTML byte', async ({ request }) => {
		const res = await request.get('/login', { headers: { cookie: 'theme=dark' } });
		expect(await res.text()).toMatch(/<html[^>]*data-theme="dark"/);
	});
	test('a light cookie overrides a dark OS', async ({ browser }) => {
		const ctx = await browser.newContext({ colorScheme: 'dark' });
		await ctx.addCookies([{ name: 'theme', value: 'light', url: 'http://localhost:4173' }]);
		const page = await ctx.newPage();
		await page.goto('/login');
		const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
		expect(bg).toBe('rgb(248, 246, 245)'); // --ground light #f8f6f5
	});
});
```

Run: `bunx playwright test src/routes/theme.e2e.ts`
Expected: FAIL.

- [ ] **Step 2: Write the tokens and type rules in `layout.css`**

Values copied from DESIGN.md §2. `body { background: var(--ground); color: var(--text); }`. Fonts: import `@fontsource/ibm-plex-sans` 400/500/600 and `@fontsource/ibm-plex-mono` 400; `:lang(zh-Hans)` and `:lang(zh-Hant)` font stacks and line height 1.7 from DESIGN.md §3; a `.tabular` utility for `font-variant-numeric: tabular-nums`. Under `prefers-reduced-motion`, transitions are off.

- [ ] **Step 3: Render the theme on the server**

`hooks.server.ts` reads the theme with `readTheme()` and uses `transformPageChunk` to fill a `%theme%` placeholder on `<html>` in `app.html` with ` data-theme="dark"`, ` data-theme="light"`, or nothing. `<meta name="theme-color">` becomes two tags with the two `--ground` values and `media="(prefers-color-scheme: …)"`.

- [ ] **Step 4: Run the tests**

Run: `bunx playwright test src/routes/theme.e2e.ts && bun run check`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src package.json bun.lock
git commit -m "feat(ui): design tokens, Plex fonts, server-rendered theme"
```

---

### Task 3: Shared formatters

**Files:**

- Create: `src/lib/format.ts`
- Test: `src/lib/format.test.ts`

**Interfaces:**

- Produces:
  - `formatRupiah(amount: number): string` (always `id-ID`, IDR, no decimals, whatever the UI locale)
  - `formatCount(n: number, locale: string): string` (`Intl.NumberFormat(locale)`)
  - `formatTime(date: Date, locale: string, timeZone: string): string` (24-hour `HH:mm`)
  - `formatMissing(value: string | number | null | undefined): string` (`—` for null/undefined, the value otherwise; `0` stays `0`)

- [ ] **Step 1: Write the failing tests**

```ts
describe('formatters', () => {
	it('prints rupiah with dots and no decimals', () => {
		expect(formatRupiah(1250000).replace(/\s/g, ' ')).toBe('Rp 1.250.000');
	});
	it('prints rupiah the same whatever the UI locale', () => {
		expect(formatRupiah(1250000.4).replace(/\s/g, ' ')).toBe('Rp 1.250.000');
	});
	it('formats counts in the UI locale', () => {
		expect(formatCount(1284, 'en')).toBe('1,284');
		expect(formatCount(1284, 'id')).toBe('1.284');
	});
	it('prints 24-hour time in the branch time zone', () => {
		const d = new Date('2026-11-01T02:30:00Z');
		expect(formatTime(d, 'en', 'Asia/Jakarta')).toBe('09:30');
	});
	it('prints a dash for a missing value but keeps zero', () => {
		expect(formatMissing(null)).toBe('—');
		expect(formatMissing(0)).toBe('0');
	});
});
```

`replace(/\s/g, ' ')` normalises the non-breaking space `Intl` puts after `Rp`.

Run: `bun run test:unit -- --run src/lib/format.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 2: Implement `format.ts`** with one module-level `Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 })` reused by every call.

- [ ] **Step 3: Run the tests**

Run: `bun run test:unit -- --run src/lib/format.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 4: Commit**

```bash
git add src/lib/format.ts src/lib/format.test.ts
git commit -m "feat(ui): shared rupiah, count, and time formatters"
```

---

### Task 4: shadcn-svelte, toasts, icons, and GRII components

**Files:**

- Create: `components.json`, `src/lib/components/ui/**` (generated), `src/lib/components/BrandMark.svelte`, `src/lib/components/StatusPill.svelte`, `src/lib/components/ThemeSwitch.svelte`, `src/routes/theme/+server.ts`
- Modify: `src/routes/+layout.svelte`, `src/routes/layout.css`, `package.json`
- Test: `src/lib/components/components.svelte.test.ts`

**Interfaces:**

- Consumes: tokens (Task 2), messages (Task 1).
- Produces:
  - shadcn-svelte `button`, `input`, `label`, `alert-dialog`, `dialog`, `sheet`, `sonner` in `src/lib/components/ui/`, restyled per `src/lib/components/DESIGN.md` (button 32px staff / 48px member via a `size` of `staff` | `member`; 6px radius; inputs 40px / 48px)
  - `<Toaster />` from svelte-sonner mounted once in `+layout.svelte`
  - `BrandMark.svelte` props `{ height: 24 | 32 }`: the white logo on a `#8c0001` tile, alt `GRII`
  - `StatusPill.svelte` props `{ tone: 'positive' | 'negative' | 'warning' | 'neutral'; label: string }`
  - `ThemeSwitch.svelte` props `{ current: Theme }`: three-option segmented control (Light, Dark, System) that POSTs `{ theme }` to `/theme`, which sets the `theme` cookie for one year and returns 204; the page then sets `data-theme` without a reload

- [ ] **Step 1: Install**

Run `bunx shadcn-svelte@latest init`, then `bunx shadcn-svelte@latest add button input label alert-dialog dialog sheet sonner`. Map the shadcn variables to tokens exactly as DESIGN.md §2 "Wiring". Install `@lucide/svelte` if init did not.

- [ ] **Step 2: Write the failing component tests**

```ts
describe('GRII components', () => {
	it('BrandMark has alt text GRII', async () => {
		const screen = render(BrandMark, { height: 24 });
		await expect.element(screen.getByAltText('GRII')).toBeVisible();
	});
	it('StatusPill keeps its label on one line', async () => {
		const screen = render(StatusPill, { tone: 'positive', label: 'Active' });
		const pill = screen.getByText('Active');
		expect(getComputedStyle(pill.element()).whiteSpace).toBe('nowrap');
	});
	it('ThemeSwitch offers three named options and marks the current one', async () => {
		const screen = render(ThemeSwitch, { current: 'system' });
		await expect.element(screen.getByRole('radio', { name: 'System' })).toBeChecked();
		await expect.element(screen.getByRole('radio', { name: 'Dark' })).not.toBeChecked();
	});
	it('a focused button shows a 2px focus ring', async () => {
		const screen = render(Button, { children: textSnippet('Save') });
		await userEvent.tab();
		const outline = getComputedStyle(screen.getByRole('button').element()).outlineWidth;
		expect(outline).toBe('2px');
	});
});
```

(`textSnippet` is a two-line helper in the test file that wraps `createRawSnippet`.)

Run: `bun run test:unit -- --run --project client`
Expected: FAIL.

- [ ] **Step 3: Write the three components and the `/theme` endpoint**

`/theme/+server.ts` validates the body with zod (`z.enum(['light', 'dark', 'system'])`), sets the cookie (`httpOnly: false` is not needed; keep `httpOnly: true`, `sameSite: 'lax'`, `path: '/'`), returns 204. Labels come from messages.

- [ ] **Step 4: Run the tests and checks**

Run: `bun run test:unit -- --run && bun run check && bun run lint`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add components.json src package.json bun.lock
git commit -m "feat(ui): shadcn-svelte, toasts, brand mark, pill, theme switch"
```

---

### Task 5: Staff shell and the branch list

**Files:**

- Modify: `src/routes/(admin)/+layout.svelte`, `src/routes/(admin)/+layout.server.ts`, `src/routes/(admin)/branches/+page.svelte`, `src/routes/(admin)/dashboard/+page.svelte`
- Create: `src/lib/components/StaffSidebar.svelte`, `src/lib/components/StaffMenuSheet.svelte`, `src/lib/components/PageTitle.svelte`
- Delete: `src/routes/(admin)/users/` (the `users` table is gone; People comes with Membership)
- Test: `src/routes/(admin)/staff-shell.e2e.ts`

**Interfaces:**

- Consumes: `listBranches()` (existing, returns `{ id, code, name }[]`), components (Task 4).
- Produces:
  - layout data `{ person: { id; fullName }, branches: { id; code; name }[] }`
  - `PageTitle.svelte` props `{ title: string; finding?: string }` plus an `actions` snippet: one `h1`, optional grey second line, actions on the right
  - nav items in one array `{ href; label; icon }[]` inside `StaffSidebar.svelte`; only routes that exist: Dashboard, Branches

- [ ] **Step 1: Write the failing e2e tests**

Sign in as the seeded `admin@grii.test` / `devpassword123` in a `beforeEach` (the e2e server needs the dev database seeded; document this at the top of the file).

```ts
test('desktop shows the 228px sidebar with the logo tile and nav', async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await page.goto('/branches');
	const sidebar = page.getByRole('navigation', { name: 'Main' });
	await expect(sidebar).toBeVisible();
	expect((await sidebar.boundingBox())!.width).toBe(228);
	await expect(page.getByAltText('GRII')).toBeVisible();
	await expect(page.getByRole('link', { name: 'Branches' })).toHaveAttribute(
		'aria-current',
		'page'
	);
});
test('phone hides the sidebar behind a labelled menu button and never scrolls sideways', async ({
	page
}) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto('/branches');
	await expect(page.getByRole('navigation', { name: 'Main' })).toBeHidden();
	await page.getByRole('button', { name: 'Menu' }).click();
	await expect(page.getByRole('dialog').getByRole('link', { name: 'Branches' })).toBeVisible();
	const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
	expect(overflow).toBe(false);
});
test('branch list shows the seeded branches by code and name', async ({ page }) => {
	await page.goto('/branches');
	await expect(page.getByRole('heading', { level: 1, name: 'Branches' })).toBeVisible();
	await expect(page.getByRole('row', { name: /JKT.*GRII Pusat/ })).toBeVisible();
});
```

Run: `bunx playwright test "src/routes/(admin)"`
Expected: FAIL.

- [ ] **Step 2: Build the shell** per `src/routes/(admin)/DESIGN.md` §1: desktop frame (228px sidebar, 48px top bar with only the account button for now; no search box until search exists), the 8px-inset sheet with 16px radius and 1px `--border`; tablet and phone fold into the 48px top bar with the 40px logo tile and the Menu button opening `StaffMenuSheet`. The branch switcher shows the current branch name only when the person has more than one branch; switching comes with a later module.

- [ ] **Step 3: Rebuild the branch list and dashboard** per §2–§3: `PageTitle`, a table on the sheet (no card), 12px grey header, 48px rows, `code` in Plex Mono, the count in the toolbar (`formatCount`), and the empty state ("No branches yet."). The dashboard shows only its title; no invented numbers.

- [ ] **Step 4: Run the tests and checks**

Run: `bunx playwright test "src/routes/(admin)" && bun run check && bun run lint`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src
git commit -m "feat(ui): staff shell and branch list on the design system"
```

---

### Task 6: Login, member shell, and profile

**Files:**

- Modify: `src/routes/login/+page.svelte`, `src/routes/(member)/+layout.svelte`, `src/routes/(member)/profile/+page.svelte`, `src/routes/login/login.e2e.ts`
- Create: `src/lib/components/MemberBottomBar.svelte`
- Test: `src/routes/login/login.e2e.ts`, `src/routes/(member)/member-shell.e2e.ts`

**Interfaces:**

- Consumes: layout data `{ person: { id; fullName } }` (existing), components (Task 4), `ThemeSwitch` (Task 4).
- Produces: `MemberBottomBar.svelte` with destinations from one array; only **Me** (`/profile`) exists now, so only Me is shown. Later modules add Home, Worship and Events to the array.

- [ ] **Step 1: Write the failing e2e tests**

```ts
// login.e2e.ts
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

// member-shell.e2e.ts (signs in as budi@grii.test / devpassword123)
test('member profile uses 18px body text and 48px tap targets', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto('/profile');
	await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
	const size = await page.evaluate(
		() => getComputedStyle(document.querySelector('main p')!).fontSize
	);
	expect(size).toBe('18px');
	const me = page.getByRole('link', { name: 'Me' });
	expect((await me.boundingBox())!.height).toBeGreaterThanOrEqual(48);
});
```

Run: `bunx playwright test src/routes/login "src/routes/(member)"`
Expected: FAIL.

- [ ] **Step 2: Rebuild the login screen** (English copy of `error_invalid_credentials`: "Invalid email, phone, or password."): the logo on a `#8c0001` panel (the one large brand field DESIGN.md §5 allows), labels above fields, the error as `role="alert"` inside the form, one full-width primary button. Phone first; the panel sits above the form on phones and beside it at ≥1100px.

- [ ] **Step 3: Rebuild the member shell and profile** per `src/routes/(member)/DESIGN.md`: 48px top bar with the 40px logo tile and the screen title, the 64px bottom bar plus safe-area inset, a centred column of at most 640px above 640px wide. Profile shows the person's full name and the theme switch; nothing invented.

- [ ] **Step 4: Run the tests and checks**

Run: `bunx playwright test && bun run check && bun run lint`
Expected: every e2e test PASSES, including the existing `pwa.e2e.ts`.

- [ ] **Step 5: Commit**

```bash
git add src
git commit -m "feat(ui): login, member shell, and profile on the design system"
```

---

### Task 7: Visual check with the taste-skill

**Files:**

- Modify: whatever the inspector findings point at, within `src/routes/**` and `src/lib/components/**`

- [ ] **Step 1: Inspect every screen in app mode**

Invoke the `design-taste-frontend` skill and follow its app-screen run (`references/app-screens.md`). Do **not** redraw the direction: the style is already dealt and recorded in `DESIGN.md` (framed sheet, seed 1632897614). Run its inspector (`inspect.mjs --app`) and lint (`lint.mjs --app`) on `/login`, `/dashboard`, `/branches` and `/profile`, at 1440, 768 and 390 wide, in light and dark.

- [ ] **Step 2: Fix every finding that breaks a DESIGN.md rule**

Findings that conflict with DESIGN.md lose to DESIGN.md; list them in the report instead of changing the design.

- [ ] **Step 3: Re-run the inspector and all checks**

Run: the inspector again, then `bunx playwright test && bun run test:unit -- --run && bun run check && bun run lint`
Expected: no remaining DESIGN.md violations; all tests PASS.

- [ ] **Step 4: Commit**

```bash
git add src
git commit -m "fix(ui): visual check fixes from the taste-skill inspector"
```

---

## Not in this plan

Registration, adding household members, activation, the OTP step, acting for a household member, the branch city picker and create form, uploads, and the Home, Worship and Events destinations. Each comes after its backend services exist.
