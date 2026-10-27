# Membership 1 of 4: Messaging, Login OTP, Activation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Send WhatsApp and email messages, require an OTP on every login, and let a person with an unactivated account activate it with an OTP and a password.

**Architecture:** A `messaging` module sends a templated message over one channel; in dev and test it writes to a JSON-lines file instead of calling a provider. An `otp` module issues and verifies codes in `otp_codes` (already in the schema). The `auth` module gains a login throttle, a second login step, and activation. Routes stay thin, as in `CLAUDE.md`.

**Tech Stack:** SvelteKit 2 form actions, Drizzle, zod 4, `nodemailer` (new, SMTP), WhatsApp Cloud API over `fetch`, Paraglide JS, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-27-membership-design.md` (decisions 12–13, "Message providers", "Depends on") and `docs/superpowers/specs/2026-10-26-foundation-database-design.md` (`login_throttles`, `otp_codes`, flow 3). `CLAUDE.md` Auth section is binding.

Plans 2–4 (registration, staff screens, family self-service) follow this one.

## Global Constraints

- Login is identifier (email or phone) plus password, then an OTP. Both steps on every login.
- OTP: 6 digits, stored as `keyedHash(code)`, expires 5 minutes after creation, dies after 5 wrong tries, a new code kills the previous live one, resend unlocks after 60 seconds, at most 3 codes per person per purpose per 15 minutes.
- Login throttle: per identifier typed, in `login_throttles`, whether or not an account has it. After `LOGIN_MAX_FAILED_ATTEMPTS` (env, default 5) failures, lock for 2 minutes and reply "try again in 2 minutes". A success deletes the row. Record `last_login_at` on success.
- Never reveal whether an account exists: the same error for an unknown user and a wrong password; activation always answers "If this can be activated, we've sent a code".
- OTP delivery: WhatsApp when the account has a phone, email as fallback when the WhatsApp send fails or there is no phone.
- WhatsApp: official Cloud API directly from Meta. Email: plain SMTP (Google Workspace in development, Amazon SES before launch), switched by `.env` only.
- Audit every mutation with `recordAudit(tx, ...)` in the same transaction; never put codes, password hashes, or tokens in audit rows.
- All user-facing copy, including email subject and body, from Paraglide messages in `en`, `id`, `zh-Hans`, `zh-Hant`. zod error messages are message keys.
- Layers: route → service → repository. Only repositories touch `db`/`tx`.
- Member screens follow `src/routes/(member)/DESIGN.md`: 48px targets, main action 56px full width.
- Functions under ~40 lines, files under ~200 lines.

## Review Focus

1. A phone typed as `0812 3456 7890`, `+62 812-3456-7890`, or `62812...` must reach the same account and the same throttle row. Test in Task 3.
2. An unknown identifier must get the identical login error and lock out after the same number of tries as a real one. Test in Task 4.
3. Activation for an unknown, already active, or suspended account must answer exactly like a valid one and send nothing. Test in Task 5.
4. A consumed, expired, or other-browser challenge must never yield a session, even with the right code. Test in Task 2.
5. When WhatsApp fails and the account has an email, the code must still arrive by email; with no email the user sees "code could not be sent", which reveals nothing about the account. Test in Task 4.

---

### Task 1: Message sender with log, WhatsApp, and SMTP transports

**Files:**

- Create: `src/lib/server/modules/messaging/sender.ts`, `src/lib/server/modules/messaging/whatsapp.ts`, `src/lib/server/modules/messaging/email.ts`, `src/lib/server/modules/messaging/log.ts`
- Modify: `src/lib/server/config.ts`, `.env.example`, `package.json` (add `nodemailer`, `@types/nodemailer`), `messages/*.json`
- Test: `src/lib/server/modules/messaging/sender.test.ts`, `src/lib/server/modules/messaging/whatsapp.test.ts`

**Interfaces:**

- Produces:
  - `type Channel = 'whatsapp' | 'email'`
  - `type MessageTemplate = 'otp'` (plans 2 and 4 add `registration_approved`, `registration_needs_fix`, `consent_request`)
  - `type OutgoingMessage = { channel: Channel; to: string; template: MessageTemplate; locale: Locale; params: Record<string, string> }` (`Locale` from `$lib/paraglide/runtime`)
  - `sendMessage(msg: OutgoingMessage): Promise<void>`, throws `DeliveryError` (exported from `sender.ts`) when the provider rejects or is unreachable.
  - `buildWhatsAppTemplate(msg: OutgoingMessage): object` in `whatsapp.ts` (pure).
  - `readLoggedMessages(file: string): OutgoingMessage[]` in `log.ts`, for e2e helpers.

- [ ] **Step 1: Write the failing tests**

`sender.test.ts` (config with `MESSAGE_TRANSPORT=log`, `MESSAGE_LOG_FILE` set to a temp file):

```ts
it('log transport appends one JSON line per message', async () => {
	await sendMessage({ channel: 'email', to: 'a@mail.test', template: 'otp', locale: 'en', params: { code: '123456' } });
	expect(readLoggedMessages(file)).toEqual([expect.objectContaining({ to: 'a@mail.test', params: { code: '123456' } })]);
});
```

`whatsapp.test.ts`:

```ts
it('builds the authentication template with the code in body and copy button', () => {
	const body = buildWhatsAppTemplate({ channel: 'whatsapp', to: '+6281234567890', template: 'otp', locale: 'zh-Hant', params: { code: '123456' } });
	expect(body).toMatchObject({
		messaging_product: 'whatsapp',
		to: '6281234567890',
		type: 'template',
		template: { name: 'otp', language: { code: 'zh_TW' } }
	});
	expect(JSON.stringify(body)).toContain('"123456"');
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `bun run test:unit -- --run src/lib/server/modules/messaging`
Expected: FAIL, modules not found.

- [ ] **Step 3: Extend `config.ts`**

Add `MESSAGE_TRANSPORT: z.enum(['log', 'live']).default('log')`, `MESSAGE_LOG_FILE` (optional string), `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` (optional strings), `SMTP_PORT: z.coerce.number().default(587)`, `LOGIN_MAX_FAILED_ATTEMPTS: z.coerce.number().int().positive().default(5)`. A `superRefine` requires every WhatsApp and SMTP value when `MESSAGE_TRANSPORT` is `live`. Document each in `.env.example`.

- [ ] **Step 4: Implement the transports and `sendMessage`**

- `log.ts`: `appendFileSync` one JSON line to `MESSAGE_LOG_FILE` (when unset, `console.info` the message); `readLoggedMessages` parses the file.
- `whatsapp.ts`: Locale to Meta language code map `en→en`, `id→id`, `zh-Hans→zh_CN`, `zh-Hant→zh_TW`; `to` without the `+`. POST `https://graph.facebook.com/v23.0/${WHATSAPP_PHONE_NUMBER_ID}/messages` with `Authorization: Bearer ${WHATSAPP_ACCESS_TOKEN}`. The `otp` template is Meta's authentication template: body parameter and URL button parameter are both the code. A non-2xx response throws `DeliveryError`.
- `email.ts`: one `nodemailer.createTransport({ host, port, secure: port === 465, auth })`, created lazily. Subject and text from `m.otp_email_subject({}, { locale })` and `m.otp_email_body({ code }, { locale })`. A send error throws `DeliveryError`.
- `sender.ts`: `log` mode → log transport; `live` → the channel's transport.

Messages to add (all four locales): `otp_email_subject` ("Your GRII sign-in code"), `otp_email_body` ("Your code is {code}. It expires in 5 minutes. Never share it.").

- [ ] **Step 5: Run the tests to verify they pass**

Run: `bun run test:unit -- --run src/lib/server/modules/messaging`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/server/modules/messaging src/lib/server/config.ts .env.example package.json bun.lock messages
git commit -m "feat(messaging): WhatsApp, SMTP and log transports"
```

---

### Task 2: OTP issue and verify

**Files:**

- Create: `src/lib/server/modules/otp/code.ts`, `src/lib/server/modules/otp/repository.ts`, `src/lib/server/modules/otp/service.ts`
- Test: `src/lib/server/modules/otp/code.test.ts`, `src/lib/server/modules/otp/otp.int.test.ts`

**Interfaces:**

- Consumes: `keyedHash` (`$lib/server/crypto`), `generateSessionToken`, `hashSessionToken` (`auth/token.ts`), `otpCodes` schema.
- Produces:
  - `generateOtpCode(): string` (6 digits, `crypto.randomInt`, zero-padded)
  - `type OtpPurpose = 'login' | 'activation' | 'password_reset'`
  - `issueOtp(tx: Transaction, input: { personId: string; purpose: OtpPurpose; channel: Channel }): Promise<{ code: string; challengeToken: string }>`, throws `ValidationError('error_resend_wait')` within 60s of the last code and `ValidationError('error_too_many_codes')` past 3 per 15 minutes.
  - `verifyOtp(tx: Transaction, input: { challengeToken: string; purpose: OtpPurpose; code: string }): Promise<string>` returns `personId`; throws `ValidationError('error_invalid_code')` for wrong, expired, consumed, dead, or unknown challenge.
  - `OTP_TTL_MS = 5 * 60_000`, `OTP_RESEND_AFTER_MS = 60_000` exported from `service.ts`.

- [ ] **Step 1: Write the failing tests**

`code.test.ts`: `generateOtpCode()` matches `/^\d{6}$/` over 1,000 calls.

`otp.int.test.ts` (use `makePerson`, `vi.setSystemTime` for time):

- `verifies the right code once`: issue, verify returns `personId`; a second verify with the same token rejects with `error_invalid_code`.
- `rejects after 5 minutes`: advance 5 min + 1 s, verify rejects.
- `dies after 5 wrong tries`: 5 wrong codes, then the right code rejects.
- `a new code kills the previous one`: issue A, advance 61 s, issue B; verify A's token with A's code rejects; B works.
- `refuses a resend within 60 seconds`: second issue at +30 s rejects with `error_resend_wait`.
- `caps at 3 codes per 15 minutes`: 4th issue (each 61 s apart) rejects with `error_too_many_codes`.
- `rejects a token for another purpose`: issued for `activation`, verified as `login`, rejects.

- [ ] **Step 2: Run them to verify they fail**

Run: `bun run test:unit -- --run src/lib/server/modules/otp/code.test.ts` and `bun run test:int -- src/lib/server/modules/otp`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement**

`challengeHash = hashSessionToken(challengeToken)`; `codeHash = keyedHash(code)`. The repository reads recent codes with the `(person_id, purpose, created_at)` index for the 60 s and 15 min rules, marks earlier live codes consumed on issue, and on verify increments `attempts` in the same statement that checks it (`update ... set attempts = attempts + 1 where challenge_hash = $1 and consumed_at is null and attempts < 5 and expires_at > now() returning code_hash, person_id`), then sets `consumed_at` when the hash matches. Compare hashes with `timingSafeEqual`.

- [ ] **Step 4: Run the tests to verify they pass**

Same commands. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/modules/otp
git commit -m "feat(otp): issue and verify one-time codes"
```

---

### Task 3: Identifier normalization and the login throttle

**Files:**

- Create: `src/lib/server/modules/auth/identifier.ts`, `src/lib/server/modules/auth/throttle.ts`
- Modify: `src/lib/server/modules/auth/repository.ts`, `src/lib/server/modules/auth/schema.ts`
- Test: `src/lib/server/modules/auth/identifier.test.ts`, `src/lib/server/modules/auth/throttle.int.test.ts`

**Interfaces:**

- Produces:
  - `normalizeIdentifier(raw: string): { kind: 'email' | 'phone'; value: string }`: email lowercased and trimmed; phone stripped to digits, a leading `0` or `62` becomes `+62`, other `+` numbers kept as E.164. Throws `ValidationError('error_identifier_invalid')` when neither.
  - `assertNotLocked(identifierHash: string): Promise<void>` throws `ValidationError('error_try_again_later')`.
  - `recordFailure(identifierHash: string): Promise<void>`; locks for 2 minutes once `failed_count` reaches `config.LOGIN_MAX_FAILED_ATTEMPTS`.
  - `clearFailures(identifierHash: string): Promise<void>`.
  - `findAccountByIdentifier(identifier: { kind; value })` now also returns `email`, `phone`, `activatedAt`, `preferredLocale`.

- [ ] **Step 1: Write the failing tests**

`identifier.test.ts`:

```ts
it.each(['0812 3456 7890', '+62 812-3456-7890', '6281234567890'])('normalizes %s', (raw) => {
	expect(normalizeIdentifier(raw)).toEqual({ kind: 'phone', value: '+6281234567890' });
});
it('lowercases email', () => {
	expect(normalizeIdentifier(' Budi@GRII.test ')).toEqual({ kind: 'email', value: 'budi@grii.test' });
});
it('rejects text that is neither', () => {
	expect(() => normalizeIdentifier('budi')).toThrow('error_identifier_invalid');
});
```

`throttle.int.test.ts`: 5 `recordFailure` calls then `assertNotLocked` rejects with `error_try_again_later`; after advancing 2 min + 1 s it resolves; `clearFailures` removes the row.

- [ ] **Step 2: Run them to verify they fail**

Run: `bun run test:unit -- --run src/lib/server/modules/auth/identifier.test.ts` and `bun run test:int -- src/lib/server/modules/auth/throttle`
Expected: FAIL.

- [ ] **Step 3: Implement** the three throttle functions as one upsert each on `login_throttles`, keyed by `keyedHash(normalized.value)`. Phone lookups in the repository use the normalized E.164 value.

- [ ] **Step 4: Run the tests to verify they pass.** Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/modules/auth
git commit -m "feat(auth): identifier normalization and login throttle"
```

---

### Task 4: Two-step login

**Files:**

- Create: `src/lib/server/modules/auth/deliver-otp.ts`, `src/routes/login/verify/+page.server.ts`, `src/routes/login/verify/+page.svelte`, `src/routes/login/sign-in.ts` (e2e helper)
- Modify: `src/lib/server/modules/auth/service.ts`, `src/routes/login/+page.server.ts`, `src/routes/login/login.e2e.ts`, `src/routes/(admin)/staff-shell.e2e.ts`, `src/routes/(member)/member-shell.e2e.ts`, `playwright.config.ts`, `messages/*.json`
- Test: `src/lib/server/modules/auth/auth.int.test.ts`, `src/routes/login/login.e2e.ts`

**Interfaces:**

- Consumes: Tasks 1–3.
- Produces:
  - `deliverOtp(account: { email: string | null; phone: string | null; preferredLocale: string }, code: string): Promise<void>`: WhatsApp to `phone` when present; on `DeliveryError` or no phone, email to `email`; with neither working, throws `ValidationError('error_code_not_sent')`.
  - `login(input: unknown, meta: { ip: string }): Promise<{ challengeToken: string }>` (was `{ token, expiresAt }`).
  - `verifyLogin(input: { challengeToken: string; code: string }): Promise<{ token: string; expiresAt: Date }>`.
  - `resendLoginCode(challengeToken: string): Promise<{ challengeToken: string }>`.
  - Cookie `otp_challenge`: httpOnly, `sameSite: 'lax'`, `secure` in production, path `/`, max age 10 minutes.
  - e2e helper `signIn(page: Page, identifier: string, password?: string): Promise<void>` (default password `devpassword123`), reading the code from `MESSAGE_LOG_FILE`.

- [ ] **Step 1: Write the failing tests**

Add to `auth.int.test.ts` (log transport; read codes with `readLoggedMessages`):

- `login sends a code and only the code opens a session`: `login` returns a challenge, no session row yet; `verifyLogin` with the logged code returns a token; `last_login_at` set; one `auth.login` audit row with no code in it.
- `unknown identifier gets the same error and locks like a real one`: 5 failed `login` calls for an unknown email and 5 for a real email with a wrong password; both 6th calls reject with `error_try_again_later`; all earlier calls reject with `error_invalid_credentials`.
- `falls back to email when WhatsApp fails`: account with phone and email, `sendMessage` WhatsApp mocked to throw `DeliveryError`; the logged message is on channel `email`.
- `no working channel says code not sent`: phone only, WhatsApp throws; `login` rejects with `error_code_not_sent`.

Update `login.e2e.ts`: sign in with `budi@grii.test`, land on `/login/verify`, enter the code from the log, land on `/profile`; a wrong code shows the `error_invalid_code` text.

- [ ] **Step 2: Run them to verify they fail**

Run: `bun run test:int -- src/lib/server/modules/auth` and `bunx playwright test login`
Expected: FAIL (login still returns a session).

- [ ] **Step 3: Implement the service functions**

`login`: normalize, throttle check, verify password as today (same error for every failure, each failure calls `recordFailure`), then `clearFailures`, issue a `login` OTP in a transaction, and `deliverOtp` after commit. `verifyLogin`: verify the OTP, then create the session, touch `last_login_at`, and audit in one transaction, as the current `login` body does.

- [ ] **Step 4: Implement the routes and screen**

`/login` action sets `otp_challenge` and redirects to `/login/verify`. `/login/verify`: a 6-digit field (`inputmode="numeric"`, `autocomplete="one-time-code"`, 48px tall), a 56px full-width submit, and a resend button that is disabled for 60 seconds with a visible countdown. Without the cookie it redirects to `/login`. On success it clears the cookie, sets the session cookie, and redirects to `/`.

Messages: `login_code_title`, `login_code_label`, `login_code_submit`, `login_code_resend`, `login_code_resend_in` ({seconds}), `error_invalid_code`, `error_try_again_later` ("Too many attempts. Try again in 2 minutes."), `error_resend_wait`, `error_too_many_codes`, `error_code_not_sent`, `error_identifier_invalid`.

- [ ] **Step 5: Wire the e2e log**

`playwright.config.ts` `webServer.env`: `MESSAGE_TRANSPORT=log`, `MESSAGE_LOG_FILE=test-results/messages.jsonl`. Replace the sign-in `beforeEach` in the staff and member shell tests with `signIn(page, ...)`.

- [ ] **Step 6: Run all tests to verify they pass**

Run: `bun run test:int` and `bunx playwright test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/server/modules/auth src/routes/login src/routes/\(admin\)/staff-shell.e2e.ts src/routes/\(member\)/member-shell.e2e.ts playwright.config.ts messages
git commit -m "feat(auth): OTP as the second login step"
```

---

### Task 5: Account activation

**Files:**

- Create: `src/lib/server/modules/auth/activation.ts`, `src/routes/activate/+page.server.ts`, `src/routes/activate/+page.svelte`, `src/routes/activate/verify/+page.server.ts`, `src/routes/activate/verify/+page.svelte`
- Modify: `src/lib/server/modules/auth/repository.ts`, `src/lib/server/modules/auth/schema.ts`, `src/routes/login/+page.svelte` (link "Activate your account"), `scripts/seed/dev-data.ts` (one unactivated account), `messages/*.json`
- Test: `src/lib/server/modules/auth/activation.int.test.ts`, `src/routes/activate/activate.e2e.ts`

**Interfaces:**

- Consumes: Tasks 1–4.
- Produces:
  - `startActivation(input: unknown): Promise<{ challengeToken: string }>`: always returns a fresh challenge token. Only when an account matches that is unactivated (`activated_at is null`), `active`, and whose person is not deleted, it issues an `activation` OTP tied to that token and delivers it; otherwise it stores nothing and sends nothing.
  - `completeActivation(input: unknown): Promise<void>`: input `{ challengeToken, code, password }`, password min 8 (reuse `loginSchema.shape.password`). Verifies the OTP, sets `password_hash` and `activated_at`, ends all sessions of the person, audits `account.activated` with diff `{ activated: { before: false, after: true } }`, in one transaction. Throws `ValidationError('error_invalid_code')` for any bad code or unknown challenge.

- [ ] **Step 1: Write the failing tests**

`activation.int.test.ts`:

- `activates an unactivated account`: account with `activatedAt: null, passwordHash: null`; start, complete with the logged code and `new-password-1`; then `login` with that password succeeds to the OTP step.
- `answers the same and sends nothing for ineligible identifiers`: for an unknown email, an already active account, and a suspended account, `startActivation` resolves to `{ challengeToken: <string> }`, no message is logged, and no `otp_codes` row exists.
- `cannot complete with a token that was never backed by a code`: `completeActivation` with a token from an ineligible start rejects with `error_invalid_code`.
- `writes one audit row without the password hash`.

`activate.e2e.ts`: open `/activate` from the login link, enter the seeded unactivated email, see the "If this can be activated, we've sent a code" text, enter the logged code and a password, land on `/login` with a success toast, then `signIn` with the new password works.

- [ ] **Step 2: Run them to verify they fail**

Run: `bun run test:int -- src/lib/server/modules/auth/activation` and `bunx playwright test activate`
Expected: FAIL.

- [ ] **Step 3: Implement `activation.ts`**, the repository query for an activatable account, and `setPassword(tx, personId, hash)` plus `deleteSessionsByPersonId(tx, personId)` in the repository.

- [ ] **Step 4: Implement the screens**

`/activate`: identifier field and 56px submit; the action always sets `otp_challenge` and redirects to `/activate/verify`. `/activate/verify`: the same uniform sentence at the top, the code field, a password field with its rule ("At least 8 characters") visible under it and tied by `aria-describedby`, resend after 60 s, 56px submit. Success redirects to `/login?activated=1`, which shows a toast.

Messages: `activate_link`, `activate_title`, `activate_identifier_label`, `activate_submit`, `activate_sent` ("If this can be activated, we've sent a code."), `activate_password_label`, `activate_password_rule`, `activate_done`.

- [ ] **Step 5: Seed** one unactivated account in `scripts/seed/dev-data.ts`: a household member of Budi with email `sari@grii.test`, `passwordHash: null`, `activatedAt: null`.

- [ ] **Step 6: Run all gates**

Run: `bun run test:unit -- --run`, `bun run test:int`, `bunx playwright test`, `bun run check`, `bun run lint`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add src/lib/server/modules/auth src/routes/activate src/routes/login/+page.svelte scripts/seed/dev-data.ts messages
git commit -m "feat(auth): account activation with OTP and password"
```
