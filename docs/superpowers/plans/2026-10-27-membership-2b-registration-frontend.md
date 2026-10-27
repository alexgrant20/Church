# Membership 2b: Registration and Approval, Frontend — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The screens for registration: the public family form, the staff page with the branch link and QR code, the review queue with its decisions, the fix page, and the member consent page.

**Architecture:** Every screen is a thin SvelteKit route over the services of plan 2a. Forms use `sveltekit-superforms` with the shared zod schema `src/lib/registration/schema.ts`, so client and server validate the same way. Lists use the JSON endpoints of plan 2a with infinite scroll and `@tanstack/svelte-virtual`. Reusable pieces go in `src/lib/components/`.

**Tech Stack:** SvelteKit 2, Svelte 5 runes, Tailwind 4, shadcn-svelte (Bits UI), svelte-sonner, `sveltekit-superforms` (new), `@tanstack/svelte-virtual` (new), Paraglide JS, Vitest browser mode, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-27-membership-design.md` (decisions 1–11, 20; flows 1–3), `DESIGN.md`, `src/routes/(admin)/DESIGN.md`, `src/routes/(member)/DESIGN.md`, `src/lib/components/DESIGN.md`, and `CLAUDE.md` (UI rules). Read the shared DESIGN.md and the folder's DESIGN.md before each task.

**Depends on plan 2a** (`2026-10-27-membership-2a-registration-backend.md`), all of it: `registrationSchema`, `RegistrationInput`, `resolveLink`, `submitRegistration`, `getBranchLink`, `rotateBranchLink`, `GET /api/cities`, `GET /api/registrations`, `listRegistrations`, `countPendingRegistrations`, `getRegistration`, `approveRegistration`, `requestFix`, `markSpam`, `recordInPersonConsent`, `sendConsentRequest`, `loadFix`, `resubmitFix`, `loadConsent`, `decideConsent`. And on plan 1: `signIn`, `latestCode`, `MESSAGE_LOG_FILE`.

## Global Constraints

- Every number in the DESIGN.md files is binding. Colours only through tokens, never a raw hex in a component.
- All user-facing text from Paraglide messages in `en`, `id`, `zh-Hans`, `zh-Hant`; zod error keys are translated at render time. No hard-coded strings.
- Member and public screens are phone-first: tap targets at least 48px, 8px between neighbours, main action 56px full width, body text 18px, layouts reflow at 200% text size with no sideways scroll at 390px.
- Staff screens follow `src/routes/(admin)/DESIGN.md`: 32px controls, tables with 48px rows, sublines for secondary fields.
- Every list and select uses infinite scroll over keyset pages and renders only visible rows. Selects are searchable: server-side search, debounced 250 ms, infinite scroll, keyboard navigation.
- Dialogs, confirmations, and toasts use the shared components; never `alert()` / `confirm()` / `prompt()`.
- The public form never says a person, email, phone, or NIK already exists.
- Rate limit is per device: the register route sets an httpOnly `device_id` cookie (random, 1 year, `sameSite: 'lax'`, `secure` in production) on first visit and passes it to `submitRegistration`.
- Routes hold no logic and no `db` calls; each calls one service function and maps errors with `mapErrorToHttp`.
- A reusable component goes in `src/lib/components/`, not inside a route. Functions under ~40 lines, files under ~200 lines.

## Review Focus

1. A family of 6 on a 390px phone at 200% text size must complete the form without sideways scrolling or losing entered data between steps. Test in Task 2.
2. A validation error on step 3 for a person entered on step 2 must take the user to that person with the field focused and the error announced, not just fail silently. Test in Task 2.
3. Double-tapping Approve must send one request and show one toast. Test in Task 5.
4. The review list must keep scrolling past 50 registrations and load the next page once, not repeatedly. Test in Task 4.
5. The city select must work by keyboard alone (type, arrow, Enter) and show an empty state when nothing matches. Test in Task 1.

---

### Task 1: Form building blocks

**Files:**

- Create: `src/lib/components/CitySelect.svelte`, `src/lib/components/PersonFields.svelte`, `src/lib/components/YesNo.svelte`, `src/lib/components/infinite-list.svelte.ts`
- Modify: `package.json` (`sveltekit-superforms`, `@tanstack/svelte-virtual`), `messages/*.json`
- Test: `src/lib/components/registration-components.svelte.test.ts`

**Interfaces:**

- Produces:
  - `CitySelect` props: `{ value: string | null; label?: string; name: string; onchange?: (city: { id: string; name: string; region: string }) => void }`. Fetches `/api/cities?q=`, debounced 250 ms, loads the next page on scroll, arrow keys move, Enter picks, Escape closes; empty state text `m.select_no_results()`.
  - `createInfiniteList<T>(fetchPage: (cursor: string | null) => Promise<{ items: T[]; nextCursor: string | null }>)`: returns `{ items, loading, done, loadMore() }` as runes state; `loadMore()` is a no-op while loading or done. Reused by Task 4 and plans 3–4.
  - `YesNo` props: `{ name: string; value: boolean | null; legend: string }`, two 48px radio options in a fieldset.
  - `PersonFields` props: `{ form: SuperForm<RegistrationInput>; index: number; isRegistrant: boolean }`; renders one person's fields from the shared schema: relation (not for the registrant), full name, nickname, Chinese name, sex, birth date, birth city, NIK, email, phone, address (line, postal code, city), occupation, education, previous church (with "None"), baptism and sidi via `YesNo` that reveal date and church, and "Not a child of my spouse" for a child. Errors render under each field from the zod key.

- [ ] **Step 1: Write the failing component tests:** `CitySelect searches after typing and picks by keyboard` (mock `fetch`; type "jak", ArrowDown, Enter; `onchange` called with the first city); `CitySelect shows the empty state`; `createInfiniteList loads a page once while a load is in flight` (two `loadMore()` calls, `fetchPage` called once); `YesNo reveals its follow-up fields only on yes` (via `PersonFields`); `PersonFields shows a translated error under the field`.

- [ ] **Step 2: Run them to verify they fail.** Run: `bun run test:unit -- --run src/lib/components/registration-components`. Expected: FAIL.

- [ ] **Step 3: Implement** the components with shadcn-svelte primitives (Popover/Command for the select) and the sizes in `src/lib/components/DESIGN.md`. Messages for every label, option (the occupation and education lists from plan 2a Task 1), and hint in all four locales.

- [ ] **Step 4: Run them to verify they pass.** Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/components package.json bun.lock messages
git commit -m "feat(ui): city select, yes/no, person fields, infinite list"
```

---

### Task 2: Public registration form

**Files:**

- Create: `src/routes/register/[token]/+page.server.ts`, `src/routes/register/[token]/+page.svelte`, `src/routes/register/[token]/done/+page.svelte`, `src/routes/register/device-cookie.ts`, `src/lib/components/RegistrationForm.svelte`
- Modify: `messages/*.json`
- Test: `src/routes/register/register.e2e.ts`

**Interfaces:**

- Consumes: Task 1; plan 2a `registrationSchema`, `resolveLink`, `submitRegistration`.
- Produces:
  - `ensureDeviceId(cookies: Cookies): string` in `device-cookie.ts`.
  - `RegistrationForm` props: `{ form: SuperValidated<RegistrationInput>; branchName: string; reason?: string }`; reused by Task 6's fix page. Three steps: (1) you, (2) family members as a list with "Add person" opening `PersonFields`, address prefilled from the registrant, (3) review and submit. All steps live in one superform (`dataType: 'json'`), so going back never loses data. On a server error the form jumps to the step and person that holds the first error and focuses the field.

- [ ] **Step 1: Write the failing e2e tests** in `register.e2e.ts`:
  - `a family of 4 registers`: open the seeded branch link at 390×844; fill the registrant with baptism yes and a date; add a spouse and two children (address prefilled); submit; land on `/register/<token>/done` with `m.register_done_body()` text.
  - `the form reflows at 200% text size`: at 390px with root font size 200%, `scrollWidth <= innerWidth` on every step, and values entered on step 2 are still there after going back from step 3.
  - `a server error leads back to the field`: two people with the same phone; submit on step 3; the page shows step 2, the second person's phone field is focused and its error is visible.
  - `an unknown token shows not found`.
  - `the page sets a device cookie`: after the first visit, the context has an httpOnly `device_id` cookie.

- [ ] **Step 2: Run them to verify they fail.** Run: `bunx playwright test register`. Expected: FAIL.

- [ ] **Step 3: Implement.** `load` resolves the link (404 when null), calls `ensureDeviceId`, and returns `superValidate(zod(registrationSchema))`. The action calls `submitRegistration(params.token, form.data, { ip, deviceId, locale })` and redirects to `done`; `error_too_many_submissions` shows as a form-level message.

- [ ] **Step 4: Run them to verify they pass.** Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/routes/register src/lib/components messages
git commit -m "feat(registration): public family registration form"
```

---

### Task 3: Staff page for the branch link and QR code

**Files:**

- Create: `src/routes/(admin)/registrations/link/+page.server.ts`, `src/routes/(admin)/registrations/link/+page.svelte`, `src/lib/components/BranchSelect.svelte`, `src/routes/api/branches/+server.ts`
- Modify: `src/lib/server/modules/branch/service.ts` and `repository.ts` (keyset `searchBranches`), `messages/*.json`
- Test: `src/routes/(admin)/registrations/link.e2e.ts`

**Interfaces:**

- Consumes: plan 2a `getBranchLink`, `rotateBranchLink`.
- Produces:
  - `searchBranches(input: { q: string; cursor; limit }): Promise<{ items: { id; code; name }[]; nextCursor }>`, branch-scoped; `GET /api/branches` returns it.
  - `BranchSelect`: the same searchable select pattern as `CitySelect`, over `/api/branches`; reused by plans 3 and 4.

- [ ] **Step 1: Write the failing e2e test:** sign in as `rina@grii.test` (branch admin), open the link page from the Registrations area, see the URL and a QR SVG at 240px; copy shows a toast; "Replace link" opens an AlertDialog, confirming shows a new URL different from the old one. As `admin@grii.test` (superadmin) a branch select appears and switching branch changes the URL.

- [ ] **Step 2: Run it to verify it fails.** Run: `bunx playwright test registrations/link`. Expected: FAIL.

- [ ] **Step 3: Implement** the page: URL in Plex Mono with a copy button, the QR as inline SVG at 240px with a "Download" link (SVG file), and "Replace link" behind an AlertDialog whose text says the printed QR stops working.

- [ ] **Step 4: Run it to verify it passes.** Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/routes/\(admin\)/registrations/link src/lib/components/BranchSelect.svelte src/routes/api/branches src/lib/server/modules/branch messages
git commit -m "feat(registration): staff page for the branch link and QR"
```

---

### Task 4: Review queue list and detail

**Files:**

- Create: `src/routes/(admin)/registrations/+page.server.ts`, `src/routes/(admin)/registrations/+page.svelte`, `src/routes/(admin)/registrations/[id]/+page.server.ts`, `src/routes/(admin)/registrations/[id]/+page.svelte`, `src/lib/components/VirtualTable.svelte`
- Modify: `src/lib/components/StaffSidebar.svelte` (Registrations item with a pending count badge), `src/routes/(admin)/+layout.server.ts` (pending count), `messages/*.json`
- Test: `src/routes/(admin)/registrations/registrations.e2e.ts`

**Interfaces:**

- Consumes: Task 1 `createInfiniteList`; plan 2a `GET /api/registrations`, `countPendingRegistrations`, `getRegistration`.
- Produces: `VirtualTable` props `{ rows: T[]; rowHeight: number; onEnd: () => void; row: Snippet<[T]>; header: Snippet }`, header kept in view while scrolling; reused by plan 3.

- [ ] **Step 1: Write the failing e2e tests:** seed 60 pending registrations for the branch in the test's setup through `submitRegistration`; as `rina@grii.test`: the sidebar shows the count; the list shows tabs Pending and Needs fix; scrolling to the end loads rows 51–60 with exactly one `/api/registrations` request carrying a cursor; opening one shows the header card (registrant, people count, submitted time), the people table with masked NIK, consent state, and name-and-birth-date warnings linking to the member. At 390px the table keeps 4–5 columns with sublines and the page does not scroll sideways.

- [ ] **Step 2: Run them to verify they fail.** Run: `bunx playwright test registrations.e2e`. Expected: FAIL.

- [ ] **Step 3: Implement** per `src/routes/(admin)/DESIGN.md` (table on the sheet, 48px rows, 12px grey sentence-case header, `--rule` lines, status pills for consent). The action buttons render disabled; Task 5 wires them.

- [ ] **Step 4: Run them to verify they pass.** Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/routes/\(admin\) src/lib/components messages
git commit -m "feat(registration): staff review queue screens"
```

---

### Task 5: Approve, needs fix, spam, and consent actions

**Files:**

- Modify: `src/routes/(admin)/registrations/[id]/+page.server.ts`, `src/routes/(admin)/registrations/[id]/+page.svelte`, `messages/*.json`
- Test: `src/routes/(admin)/registrations/decide.e2e.ts`

**Interfaces:**

- Consumes: plan 2a `approveRegistration`, `requestFix`, `markSpam`, `recordInPersonConsent`, `sendConsentRequest`.

- [ ] **Step 1: Write the failing e2e tests:** `approve creates the household`: Approve, one success toast, the registration leaves the Pending tab, and the registrant's approval message appears in the message log; `double-tapping Approve sends one request` (two fast clicks; one POST, one toast); `needs fix requires a reason` (empty reason blocked with a field error; with a reason, the needs-fix message is logged); `spam asks first` (AlertDialog, then the registration is gone and nothing is logged); `approve is disabled while consent is waiting`, with the reason shown, and "Recorded in person" on that person enables it; `a warning can send a consent request`.

- [ ] **Step 2: Run them to verify they fail.** Run: `bunx playwright test decide`. Expected: FAIL.

- [ ] **Step 3: Implement** named form actions `approve`, `fix`, `spam`, `consentInPerson`, `consentRequest`, each with `use:enhance` that disables the button while submitting. Approve is the one filled primary button; Needs fix opens a Dialog with a required reason textarea; Spam is behind an AlertDialog. Toasts via svelte-sonner.

- [ ] **Step 4: Run them to verify they pass.** Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/routes/\(admin\)/registrations messages
git commit -m "feat(registration): review decisions on the staff screen"
```

---

### Task 6: Fix page and member consent page

**Files:**

- Create: `src/routes/register/fix/[token]/+page.server.ts`, `src/routes/register/fix/[token]/+page.svelte`, `src/routes/(member)/consent/[token]/+page.server.ts`, `src/routes/(member)/consent/[token]/+page.svelte`
- Modify: `messages/*.json`
- Test: `src/routes/register/fix-consent.e2e.ts`

**Interfaces:**

- Consumes: Task 2 `RegistrationForm`, `ensureDeviceId`; plan 2a `loadFix`, `resubmitFix`, `loadConsent`, `decideConsent`; plan 1 `signIn`.

- [ ] **Step 1: Write the failing e2e tests:** `a family fixes and resubmits`: staff sends a registration back with a reason; the fix link from the message log opens `RegistrationForm` pre-filled with the reason at the top; correct a field, submit, land on the done page; the staff Pending tab shows it again; the same fix link now shows not found. `a member consents`: a registration lists Budi's email; Budi signs in, opens the consent link from the message log, sees who listed him, taps "Yes, that's me" (56px), and sees a confirmation; staff now sees consent given. `a stranger cannot open the consent link`: signed in as Rina, the link shows not found. At 390px neither page scrolls sideways.

- [ ] **Step 2: Run them to verify they fail.** Run: `bunx playwright test fix-consent`. Expected: FAIL.

- [ ] **Step 3: Implement** both pages. The consent page lives in `(member)`, so the member layout's login guard applies; it shows the registrant's name and the branch, and two 56px full-width buttons, "Yes, that's me" (primary) and "No, that's not me" (outline).

- [ ] **Step 4: Run them to verify they pass.** Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/routes/register/fix src/routes/\(member\)/consent messages
git commit -m "feat(registration): fix page and member consent page"
```

---

### Task 7: Visual check with the taste-skill

**Files:**

- Modify: only files from Tasks 1–6, for fixes the check finds
- Test: all suites

- [ ] **Step 1: Shoot the screens.** Use the `design-taste-frontend` skill in app mode. Do not redraw the style; it is fixed in DESIGN.md. Sign in as the seeded users with a Playwright script in `.taste-skill/` (gitignored) and screenshot `/register/<token>` (each step), its done page, `/registrations`, `/registrations/<id>`, `/registrations/link`, the fix page, and the consent page at 1440, 768, and 390 wide, in light and dark. Check horizontal overflow and console errors on each.

- [ ] **Step 2: Run the skill's lint and inspector** on the public pages, and read every screenshot against DESIGN.md (sizes, one filled primary per screen, token colours only, no blur or glow).

- [ ] **Step 3: Fix what fails,** within DESIGN.md, and list each finding with its fix (or why it was kept) in the commit body.

- [ ] **Step 4: Run all gates**

Run: `bun run test:unit -- --run`, `bun run test:int`, `bunx playwright test`, `bun run check`, `bun run lint`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add -A src messages
git commit -m "fix(ui): visual check fixes for the registration screens"
```
