# Membership 2 of 4: Registration and Approval — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A family registers through its branch's link or QR code; the branch admin approves it, sends it back to fix, or closes it as spam; an existing member listed again is linked only after they consent; approved families are notified and can activate.

**Architecture:** A submission is stored whole in `registrations.payload` (validated JSON) and becomes real `households`, `people`, `member_profiles`, `person_relationships`, and `accounts` rows only in the approval transaction. Notices go through an outbox table written in the same transaction and delivered after commit by an in-process job that also retries and purges. Routes stay thin; `registration` services hold the rules.

**Tech Stack:** SvelteKit 2, Svelte 5 runes, Drizzle, zod 4, `sveltekit-superforms` (new), `qrcode` (new), `@tanstack/svelte-virtual` (new), Paraglide JS, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-27-membership-design.md` (decisions 1–11, 20; calls on pending registrations, Member IDs, duplicates, consent, rate limit, spam, fix link, approvers, link rotation, relationships on the form, home branch, notice language, message providers; "Data changes"; flows 1–3). Foundation spec: `docs/superpowers/specs/2026-10-26-foundation-database-design.md`. `CLAUDE.md` is binding.

**Depends on plan 1** (`2026-10-27-membership-1-otp-activation.md`): `sendMessage`, `OutgoingMessage`, `DeliveryError`, `MessageTemplate`, `normalizeIdentifier`, `readLoggedMessages`, the e2e `signIn` helper, and the activation flow.

**Not in this plan:** families adding people later (`household_addition`), life changes, `deceased_on`, the photo upload, the member list and export (plans 3 and 4). The photo is optional at registration (decision 8), so the form omits it and plan 4 adds it to profile editing.

## Global Constraints

- One live registration link per branch; permanent; revocable by rotating. Token in the URL, only its SHA-256 stored.
- A pending, needs-fix, or spam registration never appears as a member, never gets a Member ID, never logs in.
- Member IDs are assigned at approval with `nextMemberCode(tx, branch, year)`, year of approval.
- Required per person: full name, nickname, sex, birth date, birth city, address line, postal code, city, occupation, education, previous church (or "none"), baptism yes/no, sidi yes/no. Optional: NIK, Chinese name. Yes to baptism or sidi makes its date and church required.
- Address is copied from the registrant to each added person by default.
- The registrant needs an email or a phone (where notices go). Other people may have one for a later login.
- Rate limit: at most 5 submissions per IP per hour, keyed by `keyedHash(ip)`.
- The public form never says a person, email, phone, or NIK already exists.
- Approvers: `branch_admin` of the registration's branch, `superadmin` for any. Queries filter through `getAccessibleBranchIds()`.
- Notices: email when the registrant gave an email, else WhatsApp. Language = the locale used on the form. WhatsApp "needs fix" says "open the link to see what to fix"; email carries the reason.
- Every write audited in the same transaction; NIK never in a diff (`{ nik: { changed: true } }`), never in the payload in clear text (encrypt with `encryptNik`, store `nikHash`).
- Lists use keyset pagination (default 50, max 100) and virtualization. All copy from Paraglide in `en`, `id`, `zh-Hans`, `zh-Hant`. Member screens: 48px targets, main action 56px full width.
- Functions under ~40 lines, files under ~200 lines.

## Review Focus

1. Two registrations approved at the same moment in one branch must get different Member IDs, and a double-click on Approve must create the household once. Test in Task 7.
2. A registrant who types an existing member's email must see exactly the same "submitted" screen as anyone else. Test in Task 4.
3. A fix link used after the registration was resubmitted, or a consent link opened by someone other than the matched member, must do nothing. Test in Task 8.
4. A family of 6 on a 390px phone at 200% text size must complete the form without sideways scrolling or losing entered data between steps. Test in Task 5.
5. Rotating the branch link must make the old QR code dead immediately, including for a form already open in someone's browser. Test in Task 3.

---

### Task 1: Schema changes

**Files:**

- Create: `src/lib/server/db/schema/registration.ts`, `src/lib/server/db/schema/membership.ts`, `src/lib/server/db/schema/registration.int.test.ts`
- Modify: `src/lib/server/db/schema/people.ts`, `src/lib/server/db/schema/auth.ts` (move `registrationLinks` out), `src/lib/server/db/schema/index.ts`, `src/lib/server/db/test/factories.ts`, `src/lib/server/modules/registration/repository.ts` (delete `claimRegistrationLink` and its test), `scripts/seed/dev-data.ts`, `drizzle/` (regenerated)
- Test: `src/lib/server/db/schema/registration.int.test.ts`

**Interfaces:**

- Produces (Drizzle tables, camelCase in TS):
  - `people`: `isMember boolean not null default true`; `memberCode` nullable; check `member_code is not null = is_member`; unique on `member_code` partial `where member_code is not null and deleted_at is null`.
  - `memberProfiles` (`membership.ts`): `personId` PK FK people; `occupation` enum `occupation` = `none, student, employee, civil_servant, entrepreneur, professional, homemaker, retired, other`; `education` enum `education` = `none, primary, junior_high, senior_high, diploma, bachelor, master, doctorate`; `previousChurch varchar(255)` nullable (null = none); `baptized boolean`, `baptismDate date`, `baptismChurch varchar(255)`; `sidi boolean`, `sidiDate date`, `sidiChurch varchar(255)`; checks: date and church not null exactly when the boolean is true; `createdAt`, `updatedAt`.
  - `registrationLinks` (`registration.ts`): `id`, `tokenHash char(64)` unique, `branchId`, `createdByPersonId`, `revokedAt`, `createdAt`, `deletedAt`; partial unique `branch_id where revoked_at is null and deleted_at is null`.
  - `registrations`: `id`, `registrationLinkId`, `branchId`, `status` enum `registration_status` = `pending, needs_fix, approved, spam`; `payload jsonb not null`; `locale varchar(7) not null`; `contactEmail varchar(255)`, `contactPhone varchar(20)` (check: one not null); `fixReason text`; `fixTokenHash char(64)` unique nullable; `submittedAt`, `decidedByPersonId`, `decidedAt`, `householdId` (set on approval); `createdAt`, `updatedAt`. Index `(branch_id, status, submitted_at, id)`.
  - `registrationConsents`: `id`, `registrationId`, `personIndex smallint` (position in the payload), `matchedPersonId` FK people, `tokenHash char(64)` unique nullable (null when only in-person consent is possible), `decision` enum `consent_decision` = `waiting, given, declined`, default `waiting`; `decidedAt`, `recordedByPersonId` (staff, for in-person); unique `(registration_id, person_index)`.
  - `registrationThrottles`: `ipHash char(64)` PK, `count smallint`, `windowStartedAt timestamptz`.
  - `outboxMessages`: `id`, `channel`, `recipient varchar(255)`, `template varchar(50)`, `locale varchar(7)`, `params jsonb`, `status` enum `outbox_status` = `pending, sent, failed`, `attempts smallint default 0`, `lastError text`, `nextAttemptAt timestamptz default now()`, `createdAt`, `sentAt`. Index `(status, next_attempt_at)`.
  - Factories: `makeRegistrationLink`, `makeRegistration`, `makeMemberProfile`.

- [ ] **Step 1: Write the failing tests** in `registration.int.test.ts`:
  - `allows one live link per branch`: a second unrevoked link for the same branch fails with `/unique/`; after revoking the first, it succeeds.
  - `a member needs a Member ID and a non-member must not have one`: `makePerson({ isMember: false, memberCode: null })` succeeds; `{ isMember: true, memberCode: null }` and `{ isMember: false, memberCode: 'X' }` fail with `/check/`.
  - `baptism date and church follow the yes/no`: `baptized: true` without a date fails; `baptized: false` with a date fails.
  - `a registration needs a contact`: both contacts null fails.

- [ ] **Step 2: Run them to verify they fail.** Run: `bun run test:int -- src/lib/server/db/schema/registration`. Expected: FAIL.

- [ ] **Step 3: Implement the tables,** regenerate migrations from scratch (`rm -r drizzle && bun run db:generate`; no data to keep), update factories and the seed (one live link per seeded branch; seeded people get member profiles).

- [ ] **Step 4: Run all integration tests to verify they pass.** Run: `bun run test:int`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/db scripts/seed drizzle src/lib/server/modules/registration
git commit -m "feat(db): registrations, consents, outbox, member profiles"
```

---

### Task 2: Outbox, notices, and the job runner

**Files:**

- Create: `src/lib/server/modules/messaging/outbox.ts`, `src/lib/server/modules/messaging/outbox-repository.ts`, `src/lib/server/jobs.ts`
- Modify: `src/lib/server/modules/messaging/sender.ts`, `src/lib/server/modules/messaging/whatsapp.ts`, `src/lib/server/modules/messaging/email.ts`, `src/hooks.server.ts`, `messages/*.json`
- Test: `src/lib/server/modules/messaging/outbox.int.test.ts`, `src/lib/server/jobs.int.test.ts`

**Interfaces:**

- Consumes: plan 1 `sendMessage`, `DeliveryError`.
- Produces:
  - `MessageTemplate` gains `registration_approved` (params `name`, `activateUrl`, `someoneNotAdded: 'yes' | 'no'`), `registration_needs_fix` (params `name`, `fixUrl`, `reason`; WhatsApp omits `reason`), `consent_request` (params `registrantName`, `consentUrl`).
  - `enqueueMessage(tx: Transaction, msg: OutgoingMessage): Promise<string>` returns the outbox id.
  - `deliverOutbox(ids?: string[]): Promise<void>`: sends due `pending` rows (all due rows when `ids` is omitted); success sets `sent`; `DeliveryError` increments `attempts`, stores `lastError`, sets `nextAttemptAt` to `now + 5 min × attempts`; after 5 attempts sets `failed`.
  - `runJobs(): Promise<void>` in `jobs.ts`: `deliverOutbox()`, then hard-delete `otp_codes` older than 1 day, `login_throttles` and `registration_throttles` idle 1 day, `error_logs` older than 1 month.
  - `hooks.server.ts` exports `init` that starts `setInterval(runJobs, 5 * 60_000)` unless `NODE_ENV === 'test'`.

- [ ] **Step 1: Write the failing tests**
  - `outbox.int.test.ts`: `a rolled-back transaction leaves no message` (enqueue inside a tx that throws, no row); `delivers and marks sent`; `retries with backoff and gives up after 5` (sender mocked to throw `DeliveryError`: after 1 run `attempts = 1`, `nextAttemptAt` about 5 min ahead, a run before then sends nothing; after 5 runs `failed`).
  - `jobs.int.test.ts`: `purges expired security rows and old error logs` while keeping fresh ones.

- [ ] **Step 2: Run them to verify they fail.** Run: `bun run test:int -- src/lib/server/modules/messaging src/lib/server/jobs`. Expected: FAIL.

- [ ] **Step 3: Implement.** Add the three templates to the WhatsApp builder (utility templates named as the keys) and the email builder (subject and body messages per template in all four locales). One shortcut comment in `jobs.ts`: `// shortcut: in-process interval, one app instance only; move to a real scheduler before running more than one instance.`

- [ ] **Step 4: Run the tests to verify they pass.** Same command. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/modules/messaging src/lib/server/jobs.ts src/hooks.server.ts messages
git commit -m "feat(messaging): outbox with retries and scheduled clean-up"
```

---

### Task 3: Branch registration link and QR code

**Files:**

- Create: `src/lib/server/modules/registration/link-service.ts`, `src/lib/server/modules/registration/link-repository.ts`, `src/routes/(admin)/registrations/link/+page.server.ts`, `src/routes/(admin)/registrations/link/+page.svelte`
- Modify: `package.json` (`qrcode`, `@types/qrcode`), `messages/*.json`
- Test: `src/lib/server/modules/registration/link.int.test.ts`

**Interfaces:**

- Produces:
  - `getBranchLink(branchId: string): Promise<{ url: string; qrSvg: string }>`: creates the branch's first link when none is live. The token is shown only here, so it is stored encrypted as well as hashed: add `tokenEncrypted bytea` to `registrationLinks` (AES-GCM via the existing helpers, generalized as `encryptSecret`/`decryptSecret` in `crypto.ts`, with `encryptNik`/`decryptNik` calling them).
  - `rotateBranchLink(branchId: string): Promise<{ url: string; qrSvg: string }>`: revokes the live link and creates a new one in one transaction; audited `registration_link.rotated`.
  - `resolveLink(token: string): Promise<{ linkId: string; branchId: string; branchName: string } | null>`: null for unknown or revoked.
  - URL format: `${config.ORIGIN}/register/${token}`, token from `generateSessionToken()`.
  - Both staff functions require `branch_admin` of that branch or `superadmin` (`ForbiddenError` otherwise).

- [ ] **Step 1: Write the failing tests:** `creates one link per branch and returns the same one twice`; `rotating kills the old token at once` (`resolveLink(old)` is null right after rotate, new resolves); `a pastor cannot see or rotate the link` (`ForbiddenError`); `rotation writes one audit row without the token`.

- [ ] **Step 2: Run them to verify they fail.** Run: `bun run test:int -- src/lib/server/modules/registration/link`. Expected: FAIL.

- [ ] **Step 3: Implement** the services and the staff page: branch picker for superadmin (searchable select, one branch preselected for branch admins), the URL with a copy button, the QR as inline SVG at 240px with a "Download" link (SVG file), and "Replace link" behind an AlertDialog that says the printed QR stops working.

- [ ] **Step 4: Run the tests to verify they pass.** Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server src/routes/\(admin\)/registrations/link package.json bun.lock messages
git commit -m "feat(registration): branch link with QR code and rotation"
```

---

### Task 4: Registration payload and submit

**Files:**

- Create: `src/lib/registration/schema.ts` (shared client and server), `src/lib/server/modules/registration/relationships.ts`, `src/lib/server/modules/registration/submit.ts`, `src/lib/server/modules/registration/repository.ts` (rewrite)
- Test: `src/lib/registration/schema.test.ts`, `src/lib/server/modules/registration/relationships.test.ts`, `src/lib/server/modules/registration/submit.int.test.ts`

**Interfaces:**

- Produces:
  - `registrationSchema` (zod, error messages are message keys): `{ people: Person[] (1–15), parentsMarried: boolean (default true) }`. `people[0].relation === 'self'`; the rest are `'spouse' | 'child' | 'parent' | 'sibling'`; at most 1 spouse and 2 parents. `Person`: `relation`, `fullName`, `nickname`, `chineseName?`, `sex`, `birthDate` (not in the future), `birthCityId`, `nik?` (16 digits after `normalizeNik`), `email?`, `phone?`, `address: { line, postalCode, cityId }`, `occupation`, `education`, `previousChurch: string | null`, `baptism: { baptized: false } | { baptized: true; date; church }`, `sidi` (same shape), `notChildOfSpouse?: boolean` (child only). `people[0]` needs `email` or `phone`. No two people share an NIK, email, or phone (`error_duplicate_in_form`, on the later field).
  - `type RegistrationInput = z.infer<typeof registrationSchema>`.
  - `deriveRelationships(people: RegistrationInput['people'], parentsMarried: boolean): Array<{ kind: 'parent' | 'spouse'; from: number; to: number }>` (indexes; for `parent`, `from` is the parent). Rules: spouse ↔ self; self → each child; spouse → each child unless `notChildOfSpouse`; each parent → self; each parent → each sibling; the two parents are spouses when `parentsMarried`; a sibling with no parent on the form gets no row.
  - `submitRegistration(token: string, input: unknown, meta: { ip: string; locale: Locale }): Promise<void>`: unknown or revoked token → `NotFoundError`; throttle (`error_too_many_submissions` past 5 per IP per hour); parse; encrypt NIKs and add their hashes in the stored payload; insert `pending`; for each person whose NIK hash, email, or phone matches a live member, insert a `registrationConsents` row and, when that member has an activated account, enqueue `consent_request` to it; audit `registration.submitted` (diff lists people count only). Resolves the same way whether or not anything matched.

- [ ] **Step 1: Write the failing tests**
  - `schema.test.ts`: a valid family of 4 parses; a baptized person without a date fails with the date key; two people with the same phone fail with `error_duplicate_in_form` on the second; a registrant with neither email nor phone fails; a third parent fails.
  - `relationships.test.ts`, one case per rule above, including `step-child is not the spouse's child` and `sibling without parents on the form gets no row`.
  - `submit.int.test.ts`: `stores a pending registration and creates no people`; `a matching email creates a waiting consent and a consent message, and the call resolves exactly like a clean one`; `a matched member without an activated account gets a consent row with no token and no message`; `the 6th submission from one IP within an hour is refused`; `a revoked link is refused`; `the stored payload holds no clear NIK`.

- [ ] **Step 2: Run them to verify they fail.** Run: `bun run test:unit -- --run src/lib/registration src/lib/server/modules/registration` and `bun run test:int -- src/lib/server/modules/registration/submit`. Expected: FAIL.

- [ ] **Step 3: Implement.** Matching is one query per list: collect the submitted hashes, emails, and phones, then one `select` joining `people` and `accounts` with `inArray` on each, grouped in memory.

- [ ] **Step 4: Run the tests to verify they pass.** Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/registration src/lib/server/modules/registration
git commit -m "feat(registration): shared payload schema and submit"
```

---

### Task 5: Public registration form

**Files:**

- Create: `src/routes/register/[token]/+page.server.ts`, `src/routes/register/[token]/+page.svelte`, `src/routes/register/[token]/done/+page.svelte`, `src/lib/components/PersonFields.svelte`, `src/lib/components/CitySelect.svelte`, `src/routes/api/cities/+server.ts`, `src/lib/server/modules/location/` (search service and repository, if not present)
- Modify: `package.json` (`sveltekit-superforms`, `@tanstack/svelte-virtual`), `messages/*.json`
- Test: `src/routes/register/register.e2e.ts`

**Interfaces:**

- Consumes: Task 4 `registrationSchema`, `submitRegistration`, `resolveLink`.
- Produces:
  - `GET /api/cities?q=&cursor=` → `{ items: { id, name, region }[], nextCursor }`, trigram search, keyset, 50 per page, max 100.
  - `CitySelect`: searchable select (debounced 250 ms, infinite scroll, keyboard navigation), reused by plans 3 and 4.
  - `PersonFields`: one person's fields; reused by plan 4's "add person" and the fix page.

- [ ] **Step 1: Write the failing e2e test** `register.e2e.ts`: open the seeded branch link at 390×844; fill the registrant, add a spouse and two children (the address prefilled from the registrant), answer baptism yes with a date for the registrant; submit; land on `/register/<token>/done` with the "we will review it" text; the staff queue (Task 6) is not needed. Second test: at 390px with `document.documentElement.style.fontSize = '200%'`, `scrollWidth <= innerWidth` on every step and entered values survive going back a step. Third: an unknown token shows a 404 page.

- [ ] **Step 2: Run it to verify it fails.** Run: `bunx playwright test register`. Expected: FAIL.

- [ ] **Step 3: Implement.** Superforms with the zod adapter and `dataType: 'json'`; steps: (1) you, (2) family members as a list with "Add person", each opening `PersonFields`, (3) review and submit. Step state lives in the one superform, so going back never loses data. Branch name shown at the top. Baptism and sidi as yes/no radios that reveal date and church. "None" options for occupation, education, previous church.

- [ ] **Step 4: Run it to verify it passes.** Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/routes/register src/routes/api/cities src/lib/components src/lib/server/modules/location package.json bun.lock messages
git commit -m "feat(registration): public family registration form"
```

---

### Task 6: Staff review queue

**Files:**

- Create: `src/lib/server/modules/registration/review-service.ts`, `src/routes/(admin)/registrations/+page.server.ts`, `src/routes/(admin)/registrations/+page.svelte`, `src/routes/(admin)/registrations/[id]/+page.server.ts`, `src/routes/(admin)/registrations/[id]/+page.svelte`, `src/routes/api/registrations/+server.ts`
- Modify: `src/lib/components/StaffSidebar.svelte` (nav item with pending count), `src/routes/(admin)/+layout.server.ts`, `messages/*.json`
- Test: `src/lib/server/modules/registration/review.int.test.ts`, `src/routes/(admin)/registrations/registrations.e2e.ts`

**Interfaces:**

- Produces:
  - `listRegistrations(input: { status: 'pending' | 'needs_fix'; cursor?: string; limit?: number }): Promise<{ items: { id; registrantName; peopleCount; submittedAt; waitingConsents: number }[]; nextCursor: string | null }>`, ordered `(submitted_at, id)`, branch-scoped.
  - `countPendingRegistrations(): Promise<number>` (branch-scoped, for the sidebar).
  - `getRegistration(id: string): Promise<{ id; status; branchName; people: (Person & { nikMasked?: string; consent?: 'waiting' | 'given' | 'declined' | 'in_person_needed'; warnings: { personId; memberCode; fullName }[] })[]; fixReason }>`: warnings are live members with the same lowercased trimmed full name and birth date, found with one query.
  - Only `branch_admin` (own branch) and `superadmin`; others get `ForbiddenError`.

- [ ] **Step 1: Write the failing tests:** `lists only my branch's pending registrations, oldest first`; `pages with a cursor` (51 rows → 50 + cursor, then 1); `shows a name-and-birth-date warning`; `masks NIK`; `a pastor is forbidden`. e2e: admin opens Registrations from the sidebar, sees the count badge, opens one, sees each person and the warnings.

- [ ] **Step 2: Run them to verify they fail.** Expected: FAIL.

- [ ] **Step 3: Implement** the services, the JSON endpoint for infinite scroll, a virtualized list, and the detail screen per `src/routes/(admin)/DESIGN.md` (header card, people as a table with sublines). Action buttons render but are wired in Task 7.

- [ ] **Step 4: Run them to verify they pass.** Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/modules/registration src/routes/\(admin\) src/routes/api/registrations src/lib/components/StaffSidebar.svelte messages
git commit -m "feat(registration): staff review queue"
```

---

### Task 7: Approve, needs fix, spam

**Files:**

- Create: `src/lib/server/modules/registration/decide.ts`, `src/lib/server/modules/registration/approve.ts`
- Modify: `src/routes/(admin)/registrations/[id]/+page.server.ts`, `src/routes/(admin)/registrations/[id]/+page.svelte`, `messages/*.json`
- Test: `src/lib/server/modules/registration/approve.int.test.ts`, `src/lib/server/modules/registration/decide.int.test.ts`

**Interfaces:**

- Consumes: Tasks 1, 2, 4, 6; `nextMemberCode`; `recordAudit`.
- Produces:
  - `approveRegistration(id: string): Promise<{ householdId: string }>`: one transaction. Claims the row with `update registrations set status = 'approved' ... where id = $1 and status = 'pending' returning *` (no row → `ValidationError('error_already_decided')`). Refuses while any consent is `waiting` (`error_waiting_for_consent`). Creates the household; each person not linked by consent gets a `people` row (`isMember: true`, Member ID, `preferredLocale` = registration locale, home branch = registration branch, `registeredByPersonId` = the registrant's new id), a `member_profiles` row, and, with an email or phone, an unactivated `accounts` row. A person with consent `given` is moved: `household_id` set to the new household, no new row. Declined people are skipped. Relationship rows come from `deriveRelationships`, mapping indexes to the new or linked person ids. Audits `registration.approved` plus one `person.created` per new person (NIK as `{ nik: { changed: true } }`). Enqueues `registration_approved` to the registration contact with `activateUrl = ${ORIGIN}/activate` and `someoneNotAdded = 'yes'` when anyone was declined; delivers it after commit.
  - `requestFix(id: string, reason: string): Promise<void>`: from `pending`; sets `needs_fix`, `fixReason`, a new fix token (hash stored); enqueues `registration_needs_fix` with `fixUrl = ${ORIGIN}/register/fix/${token}`; audited.
  - `markSpam(id: string): Promise<void>`: from `pending`; sets `spam`; no message; audited.
  - `recordInPersonConsent(registrationId: string, personIndex: number): Promise<void>`: staff only; sets `given` with `recordedByPersonId`; audited.
  - `sendConsentRequest(registrationId: string, personIndex: number, memberPersonId: string): Promise<void>`: from a name-and-birth-date warning; creates the consent row (with token and message when the member has an activated account).

- [ ] **Step 1: Write the failing tests**
  - `approve.int.test.ts`: `creates household, people, profiles, accounts, and relationships for a family of 4` (assert the exact parent and spouse rows); `gives two concurrent approvals in one branch different Member IDs` (`Promise.all` of two registrations); `approving the same registration twice creates one household` (`Promise.all` of the same id; one rejects with `error_already_decided`); `refuses while a consent is waiting`; `moves a consenting member into the new household and keeps their Member ID`; `skips a declined person and says so in the notice`; `enqueues one approved notice in the registration locale`; `rolls back everything when a step fails` (force a unique violation; no household, no outbox row).
  - `decide.int.test.ts`: `needs fix stores the reason and sends the fix link`; `the WhatsApp needs-fix notice carries no reason`; `spam sends nothing`; `a decided registration cannot be decided again`.

- [ ] **Step 2: Run them to verify they fail.** Run: `bun run test:int -- src/lib/server/modules/registration`. Expected: FAIL.

- [ ] **Step 3: Implement** the services (split `approve.ts` into helpers to stay under 40 lines each) and wire the three buttons: Approve (primary, disabled with the reason while consent is waiting), Needs fix (dialog with a required reason), Spam (AlertDialog). Toasts on success.

- [ ] **Step 4: Run them to verify they pass.** Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/modules/registration src/routes/\(admin\)/registrations messages
git commit -m "feat(registration): approve, needs fix, and spam decisions"
```

---

### Task 8: Fix link and consent pages

**Files:**

- Create: `src/lib/server/modules/registration/fix.ts`, `src/lib/server/modules/registration/consent.ts`, `src/routes/register/fix/[token]/+page.server.ts`, `src/routes/register/fix/[token]/+page.svelte`, `src/routes/(member)/consent/[token]/+page.server.ts`, `src/routes/(member)/consent/[token]/+page.svelte`
- Modify: `messages/*.json`
- Test: `src/lib/server/modules/registration/fix-consent.int.test.ts`, `src/routes/register/fix-consent.e2e.ts`

**Interfaces:**

- Consumes: Tasks 4, 5, 7; plan 1 `signIn`.
- Produces:
  - `loadFix(token: string): Promise<{ reason: string; input: RegistrationInput }>`: only while `needs_fix`; NIKs returned masked and left unchanged unless retyped.
  - `resubmitFix(token: string, input: unknown, meta): Promise<void>`: same validation and matching as submit; sets `pending`, clears the fix token and reason; audited `registration.resubmitted`. A used or unknown token → `NotFoundError`.
  - `loadConsent(token: string): Promise<{ registrantName: string; branchName: string }>` and `decideConsent(token: string, decision: 'given' | 'declined'): Promise<void>`: the logged-in person must be the `matchedPersonId` (`NotFoundError` otherwise, so a stranger learns nothing); a decided consent cannot change; audited `registration.consent_given` / `registration.consent_declined`.

- [ ] **Step 1: Write the failing tests:** `the fix link loads the reason and the data`; `resubmitting returns it to pending and kills the link`; `a used fix link is not found`; `only the matched member can open the consent link`; `declining marks the person declined and approval then skips them`; `a consent cannot be decided twice`. e2e: admin sends a registration back, the fix link from the message log opens the pre-filled form, the registrant corrects a field and resubmits, the queue shows it again; a matched member signs in, opens the consent link, taps "Yes, that's me".

- [ ] **Step 2: Run them to verify they fail.** Expected: FAIL.

- [ ] **Step 3: Implement** the services and pages. The fix page reuses the registration form component with the reason at the top. The consent page shows who listed them and two 56px buttons.

- [ ] **Step 4: Run all gates**

Run: `bun run test:unit -- --run`, `bun run test:int`, `bunx playwright test`, `bun run check`, `bun run lint`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/modules/registration src/routes/register src/routes/\(member\)/consent messages
git commit -m "feat(registration): fix link and member consent"
```
