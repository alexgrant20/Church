# Membership 2a: Registration and Approval, Backend — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The server side of registration: a family registers through its branch's link or QR code; the branch admin approves it, sends it back to fix, or closes it as spam; an existing member listed again is linked only after they consent; approved families are notified and can activate. Screens are in plan 2b (`2026-10-27-membership-2b-registration-frontend.md`), which consumes the services and endpoints this plan produces.

**Architecture:** A submission is stored whole in `registrations.payload` (validated JSON) and becomes real `households`, `people`, `member_profiles`, `person_relationships`, and `accounts` rows only in the approval transaction. Notices go through an outbox table written in the same transaction and delivered after commit by an in-process job that also retries and purges. Routes stay thin; `registration` services hold the rules.

**Tech Stack:** SvelteKit 2 (`+server.ts` endpoints only), Drizzle, zod 4, `qrcode` (new, server-side SVG), Paraglide JS (message copy), Vitest.

**Spec:** `docs/superpowers/specs/2026-10-27-membership-design.md` (decisions 1–11, 20; calls on pending registrations, Member IDs, duplicates, consent, rate limit, spam, fix link, approvers, link rotation, relationships on the form, home branch, notice language, message providers; "Data changes"; flows 1–3). Foundation spec: `docs/superpowers/specs/2026-10-26-foundation-database-design.md`. `CLAUDE.md` is binding.

**Depends on plan 1** (`2026-10-27-membership-1-otp-activation.md`): `sendMessage`, `OutgoingMessage`, `DeliveryError`, `MessageTemplate`, `normalizeIdentifier`, `readLoggedMessages`, and the activation flow (the approval notice links to `/activate`).

**Not in this plan:** families adding people later (`household_addition`), life changes, `deceased_on`, the photo upload, the member list and export (plans 3 and 4). The photo is optional at registration (decision 8), so the form omits it and plan 4 adds it to profile editing.

## Global Constraints

- One live registration link per branch; permanent; revocable by rotating. Token in the URL, only its SHA-256 stored.
- A pending, needs-fix, or spam registration never appears as a member, never gets a Member ID, never logs in.
- Member IDs are assigned at approval with `nextMemberCode(tx, branch, year)`, year of approval.
- Required per person: full name, nickname, sex, birth date, birth city, address line, postal code, city, occupation, education, previous church (or "none"), baptism yes/no, sidi yes/no. Optional: NIK, Chinese name. Yes to baptism or sidi makes its date and church required.
- Address is copied from the registrant to each added person by default.
- The registrant needs an email or a phone (where notices go). Other people may have one for a later login.
- Rate limit (user's choice: per device, not per network): at most 5 submissions per device per hour, the device being a random ID in an httpOnly `device_id` cookie (1 year) keyed by `keyedHash(deviceId)`; plus a loose backstop of 50 per IP per hour against scripts, so families sharing church Wi-Fi are never blocked by each other.
- The public form never says a person, email, phone, or NIK already exists.
- Approvers: `branch_admin` of the registration's branch, `superadmin` for any. Queries filter through `getAccessibleBranchIds()`.
- Notices: email when the registrant gave an email, else WhatsApp. Language = the locale used on the form. WhatsApp "needs fix" says "open the link to see what to fix"; email carries the reason.
- Every write audited in the same transaction; NIK never in a diff (`{ nik: { changed: true } }`), never in the payload in clear text (encrypt with `encryptNik`, store `nikHash`).
- Lists use keyset pagination (default 50, max 100). Message copy (email subjects and bodies) from Paraglide in `en`, `id`, `zh-Hans`, `zh-Hant`; zod error messages are message keys.
- No `.svelte` files in this plan.
- Functions under ~40 lines, files under ~200 lines.

## Review Focus

1. Two registrations approved at the same moment in one branch must get different Member IDs, and a double-click on Approve must create the household once. Test in Task 6.
2. A registrant who types an existing member's email must see exactly the same "submitted" screen as anyone else. Test in Task 4.
3. A fix link used after the registration was resubmitted, or a consent link opened by someone other than the matched member, must do nothing. Test in Task 7.
4. A list endpoint asked for `limit=1000` must return at most 100 rows, and a malformed cursor must return 400, not 500. Test in Task 5.
5. Rotating the branch link must make the old QR code dead immediately, including a submit from a form already open with the old token. Test in Task 3 (`resolveLink`) and Task 4 (submit with a rotated token is refused).

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
  - `registrationThrottles`: `keyHash char(64)` PK (`keyedHash('device:' + id)` or `keyedHash('ip:' + ip)`), `count smallint`, `windowStartedAt timestamptz`.
  - `outboxMessages`: `id`, `channel`, `recipient varchar(255)`, `template varchar(50)`, `locale varchar(7)`, `params jsonb`, `status` enum `outbox_status` = `pending, sent, failed`, `attempts smallint default 0`, `lastError text`, `nextAttemptAt timestamptz default now()`, `createdAt`, `sentAt`. Index `(status, next_attempt_at)`.
  - Factories: `makeRegistrationLink`, `makeRegistration`, `makeMemberProfile`.

- [x] **Step 1: Write the failing tests** in `registration.int.test.ts`:
  - `allows one live link per branch`: a second unrevoked link for the same branch fails with `/unique/`; after revoking the first, it succeeds.
  - `a member needs a Member ID and a non-member must not have one`: `makePerson({ isMember: false, memberCode: null })` succeeds; `{ isMember: true, memberCode: null }` and `{ isMember: false, memberCode: 'X' }` fail with `/check/`.
  - `baptism date and church follow the yes/no`: `baptized: true` without a date fails; `baptized: false` with a date fails.
  - `a registration needs a contact`: both contacts null fails.

- [x] **Step 2: Run them to verify they fail.** Run: `bun run test:int -- src/lib/server/db/schema/registration`. Expected: FAIL.

- [x] **Step 3: Implement the tables,** regenerate migrations from scratch (`rm -r drizzle && bun run db:generate`; no data to keep), update factories and the seed (one live link per seeded branch; seeded people get member profiles).

- [x] **Step 4: Run all integration tests to verify they pass.** Run: `bun run test:int`. Expected: PASS.

- [x] **Step 5: Commit**

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

- [x] **Step 1: Write the failing tests**
  - `outbox.int.test.ts`: `a rolled-back transaction leaves no message` (enqueue inside a tx that throws, no row); `delivers and marks sent`; `retries with backoff and gives up after 5` (sender mocked to throw `DeliveryError`: after 1 run `attempts = 1`, `nextAttemptAt` about 5 min ahead, a run before then sends nothing; after 5 runs `failed`).
  - `jobs.int.test.ts`: `purges expired security rows and old error logs` while keeping fresh ones.

- [x] **Step 2: Run them to verify they fail.** Run: `bun run test:int -- src/lib/server/modules/messaging src/lib/server/jobs`. Expected: FAIL.

- [x] **Step 3: Implement.** Add the three templates to the WhatsApp builder (utility templates named as the keys) and the email builder (subject and body messages per template in all four locales). One shortcut comment in `jobs.ts`: `// shortcut: in-process interval, one app instance only; move to a real scheduler before running more than one instance.`

- [x] **Step 4: Run the tests to verify they pass.** Same command. Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add src/lib/server/modules/messaging src/lib/server/jobs.ts src/hooks.server.ts messages
git commit -m "feat(messaging): outbox with retries and scheduled clean-up"
```

---

### Task 3: Branch registration link and QR code

**Files:**

- Create: `src/lib/server/modules/registration/link-service.ts`, `src/lib/server/modules/registration/link-repository.ts`
- Modify: `src/lib/server/crypto.ts`, `src/lib/server/db/schema/registration.ts` (`tokenEncrypted`), `package.json` (`qrcode`, `@types/qrcode`)
- Test: `src/lib/server/modules/registration/link.int.test.ts`

**Interfaces:**

- Produces:
  - `getBranchLink(branchId: string): Promise<{ url: string; qrSvg: string }>`: creates the branch's first link when none is live. The token is shown only here, so it is stored encrypted as well as hashed: add `tokenEncrypted bytea` to `registrationLinks` (AES-GCM via the existing helpers, generalized as `encryptSecret`/`decryptSecret` in `crypto.ts`, with `encryptNik`/`decryptNik` calling them).
  - `rotateBranchLink(branchId: string): Promise<{ url: string; qrSvg: string }>`: revokes the live link and creates a new one in one transaction; audited `registration_link.rotated`.
  - `resolveLink(token: string): Promise<{ linkId: string; branchId: string; branchName: string } | null>`: null for unknown or revoked.
  - URL format: `${config.ORIGIN}/register/${token}`, token from `generateSessionToken()`.
  - Both staff functions require `branch_admin` of that branch or `superadmin` (`ForbiddenError` otherwise).

- [x] **Step 1: Write the failing tests:** `creates one link per branch and returns the same one twice`; `rotating kills the old token at once` (`resolveLink(old)` is null right after rotate, new resolves); `a pastor cannot see or rotate the link` (`ForbiddenError`); `rotation writes one audit row without the token`.

- [x] **Step 2: Run them to verify they fail.** Run: `bun run test:int -- src/lib/server/modules/registration/link`. Expected: FAIL.

- [x] **Step 3: Implement** the services. The QR is generated with `qrcode`'s `toString(url, { type: 'svg', margin: 1 })`.

- [x] **Step 4: Run the tests to verify they pass.** Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add src/lib/server package.json bun.lock
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
  - `submitRegistration(token: string, input: unknown, meta: { ip: string; deviceId: string; locale: Locale }): Promise<void>`: unknown or revoked token → `NotFoundError`; throttle (`error_too_many_submissions` past 5 per device or 50 per IP per hour; the plan 2b route sets the `device_id` cookie and passes it in); parse; encrypt NIKs and add their hashes in the stored payload; insert `pending`; for each person whose NIK hash, email, or phone matches a live member, insert a `registrationConsents` row and, when that member has an activated account, enqueue `consent_request` to it; audit `registration.submitted` (diff lists people count only). Resolves the same way whether or not anything matched.

- [x] **Step 1: Write the failing tests**
  - `schema.test.ts`: a valid family of 4 parses; a baptized person without a date fails with the date key; two people with the same phone fail with `error_duplicate_in_form` on the second; a registrant with neither email nor phone fails; a third parent fails.
  - `relationships.test.ts`, one case per rule above, including `step-child is not the spouse's child` and `sibling without parents on the form gets no row`.
  - `submit.int.test.ts`: `stores a pending registration and creates no people`; `a matching email creates a waiting consent and a consent message, and the call resolves exactly like a clean one`; `a matched member without an activated account gets a consent row with no token and no message`; `the 6th submission from one device within an hour is refused`; `5 devices on one IP can each submit 5`; `the 51st submission from one IP within an hour is refused`; `a revoked or rotated link is refused`; `the stored payload holds no clear NIK`.

- [x] **Step 2: Run them to verify they fail.** Run: `bun run test:unit -- --run src/lib/registration src/lib/server/modules/registration` and `bun run test:int -- src/lib/server/modules/registration/submit`. Expected: FAIL.

- [x] **Step 3: Implement.** Matching is one query per list: collect the submitted hashes, emails, and phones, then one `select` joining `people` and `accounts` with `inArray` on each, grouped in memory.

- [x] **Step 4: Run the tests to verify they pass.** Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add src/lib/registration src/lib/server/modules/registration
git commit -m "feat(registration): shared payload schema and submit"
```

---

### Task 5: City search and the review queue services

**Files:**

- Create: `src/lib/server/pagination.ts`, `src/lib/server/modules/location/service.ts`, `src/lib/server/modules/location/repository.ts`, `src/routes/api/cities/+server.ts`, `src/lib/server/modules/registration/review-service.ts`, `src/routes/api/registrations/+server.ts`
- Modify: `src/lib/server/modules/registration/repository.ts`
- Test: `src/lib/server/pagination.test.ts`, `src/lib/server/modules/location/location.int.test.ts`, `src/lib/server/modules/registration/review.int.test.ts`

**Interfaces:**

- Produces:
  - `parsePage(url: URL): { cursor: { key: string; id: string } | null; limit: number }` and `encodeCursor(key: string, id: string): string` in `pagination.ts`: `limit` default 50, clamped to 1–100; the cursor is base64url JSON of the sort key and id; a malformed cursor throws `ValidationError('error_bad_cursor')`.
  - `searchCities(input: { q: string; cursor; limit }): Promise<{ items: { id: string; name: string; region: string }[]; nextCursor: string | null }>`: trigram match on the city name, ordered `(name, id)`. `GET /api/cities?q=&cursor=&limit=` returns it; public, because the registration form is not logged in.
  - `listRegistrations(input: { status: 'pending' | 'needs_fix'; cursor; limit }): Promise<{ items: { id; registrantName; peopleCount; submittedAt; waitingConsents: number }[]; nextCursor: string | null }>`, ordered `(submitted_at, id)`, branch-scoped. `GET /api/registrations?status=&cursor=&limit=` returns it.
  - `countPendingRegistrations(): Promise<number>`, branch-scoped, for the sidebar badge.
  - `getRegistration(id: string): Promise<{ id; status; branchName; fixReason; people: (Person & { nikMasked?: string; consent?: 'waiting' | 'given' | 'declined' | 'in_person_needed'; warnings: { personId; memberCode; fullName }[] })[] }>`: warnings are live members with the same lowercased trimmed full name and birth date, found with one query for the whole registration.
  - The registration functions allow only `branch_admin` (own branch) and `superadmin`; others get `ForbiddenError`.

- [x] **Step 1: Write the failing tests**
  - `pagination.test.ts`: `clamps limit to 100`; `defaults to 50`; `rejects a malformed cursor with error_bad_cursor`; `round-trips a cursor`.
  - `location.int.test.ts`: `finds a city from part of its name` (`"jakarta sel"` finds "Jakarta Selatan"); `pages with a cursor`.
  - `review.int.test.ts`: `lists only my branch's pending registrations, oldest first`; `pages with a cursor` (51 rows → 50 + cursor, then 1); `shows a name-and-birth-date warning`; `masks NIK`; `counts waiting consents`; `a pastor is forbidden`.

- [x] **Step 2: Run them to verify they fail.** Run: `bun run test:unit -- --run src/lib/server/pagination.test.ts` and `bun run test:int -- src/lib/server/modules/location src/lib/server/modules/registration/review`. Expected: FAIL.

- [x] **Step 3: Implement.** Each endpoint parses with `parsePage`, calls one service function, and maps errors with `mapErrorToHttp`.

- [x] **Step 4: Run them to verify they pass.** Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add src/lib/server src/routes/api
git commit -m "feat(registration): city search and review queue services"
```

---

### Task 6: Approve, needs fix, spam

**Files:**

- Create: `src/lib/server/modules/registration/decide.ts`, `src/lib/server/modules/registration/approve.ts`
- Test: `src/lib/server/modules/registration/approve.int.test.ts`, `src/lib/server/modules/registration/decide.int.test.ts`

**Interfaces:**

- Consumes: Tasks 1, 2, 4, 5; `nextMemberCode`; `recordAudit`.
- Produces:
  - `approveRegistration(id: string): Promise<{ householdId: string }>`: one transaction. Claims the row with `update registrations set status = 'approved' ... where id = $1 and status = 'pending' returning *` (no row → `ValidationError('error_already_decided')`). Refuses while any consent is `waiting` (`error_waiting_for_consent`). Creates the household; each person not linked by consent gets a `people` row (`isMember: true`, Member ID, `preferredLocale` = registration locale, home branch = registration branch, `registeredByPersonId` = the registrant's new id), a `member_profiles` row, and, with an email or phone, an unactivated `accounts` row. A person with consent `given` is moved: `household_id` set to the new household, no new row. Declined people are skipped. Relationship rows come from `deriveRelationships`, mapping indexes to the new or linked person ids. Audits `registration.approved` plus one `person.created` per new person (NIK as `{ nik: { changed: true } }`). Enqueues `registration_approved` to the registration contact with `activateUrl = ${ORIGIN}/activate` and `someoneNotAdded = 'yes'` when anyone was declined; delivers it after commit.
  - `requestFix(id: string, reason: string): Promise<void>`: from `pending`; sets `needs_fix`, `fixReason`, a new fix token (hash stored); enqueues `registration_needs_fix` with `fixUrl = ${ORIGIN}/register/fix/${token}`; audited.
  - `markSpam(id: string): Promise<void>`: from `pending`; sets `spam`; no message; audited.
  - `recordInPersonConsent(registrationId: string, personIndex: number): Promise<void>`: staff only; sets `given` with `recordedByPersonId`; audited.
  - `sendConsentRequest(registrationId: string, personIndex: number, memberPersonId: string): Promise<void>`: from a name-and-birth-date warning; creates the consent row (with token and message when the member has an activated account).

- [x] **Step 1: Write the failing tests**
  - `approve.int.test.ts`: `creates household, people, profiles, accounts, and relationships for a family of 4` (assert the exact parent and spouse rows); `gives two concurrent approvals in one branch different Member IDs` (`Promise.all` of two registrations); `approving the same registration twice creates one household` (`Promise.all` of the same id; one rejects with `error_already_decided`); `refuses while a consent is waiting`; `moves a consenting member into the new household and keeps their Member ID`; `skips a declined person and says so in the notice`; `enqueues one approved notice in the registration locale`; `rolls back everything when a step fails` (force a unique violation; no household, no outbox row).
  - `decide.int.test.ts`: `needs fix stores the reason and sends the fix link`; `the WhatsApp needs-fix notice carries no reason`; `spam sends nothing`; `a decided registration cannot be decided again`.

- [x] **Step 2: Run them to verify they fail.** Run: `bun run test:int -- src/lib/server/modules/registration`. Expected: FAIL.

- [x] **Step 3: Implement** the services; split `approve.ts` into helpers to stay under 40 lines each.

- [x] **Step 4: Run them to verify they pass.** Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add src/lib/server/modules/registration
git commit -m "feat(registration): approve, needs fix, and spam decisions"
```

---

### Task 7: Fix link and consent services

**Files:**

- Create: `src/lib/server/modules/registration/fix.ts`, `src/lib/server/modules/registration/consent.ts`
- Test: `src/lib/server/modules/registration/fix-consent.int.test.ts`

**Interfaces:**

- Consumes: Tasks 4 and 6.
- Produces:
  - `loadFix(token: string): Promise<{ reason: string; input: RegistrationInput }>`: only while `needs_fix`; NIKs returned masked and left unchanged unless retyped.
  - `resubmitFix(token: string, input: unknown, meta): Promise<void>`: same validation and matching as submit; sets `pending`, clears the fix token and reason; audited `registration.resubmitted`. A used or unknown token → `NotFoundError`.
  - `loadConsent(token: string): Promise<{ registrantName: string; branchName: string }>` and `decideConsent(token: string, decision: 'given' | 'declined'): Promise<void>`: the logged-in person must be the `matchedPersonId` (`NotFoundError` otherwise, so a stranger learns nothing); a decided consent cannot change; audited `registration.consent_given` / `registration.consent_declined`.

- [x] **Step 1: Write the failing tests:** `the fix link loads the reason and the data`; `resubmitting returns it to pending and kills the link`; `a used fix link is not found`; `only the matched member can open the consent link`; `declining marks the person declined and approval then skips them`; `a consent cannot be decided twice`.

- [x] **Step 2: Run them to verify they fail.** Expected: FAIL.

- [x] **Step 3: Implement** the services.

- [x] **Step 4: Run all gates**

Run: `bun run test:unit -- --run`, `bun run test:int`, `bunx playwright test` (existing suites must stay green), `bun run check`, `bun run lint`
Expected: all pass.

- [x] **Step 5: Commit**

```bash
git add src/lib/server/modules/registration
git commit -m "feat(registration): fix link and member consent"
```
