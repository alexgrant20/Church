# Membership 4c: A New Spouse Who Wants to Be a Member — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a family records "Got married" and the new spouse wants to be a GRII member, the request goes into the branch's Registrations queue. The branch admin completes the member fields and approves it, sends it back, or declines it. The couple's move and the spouse link are written only on that decision. Staff who record such a marriage themselves create the member at once.

**Architecture:** A marriage request is a `registrations` row with `kind = 'marriage'`. The payload holds the short spouse form, the wedding date and the new address. The marrying person is a column, `subject_person_id`.

- Approval, send-back and decline reuse registration's `claim()`, so one decision wins.
- Approve and decline both call 4b's `marry()` inside the claiming transaction. `marry()` takes a spouse-writer callback, so the same move writes a member spouse (approve, staff path) or a non-member spouse (decline, 4b).
- The member row, profile, Member ID and unactivated account come from a new `createMember()` in the registration module. Registration approval already writes these rows.
- While a request is open, the person is held: "Got married" and "Moved out" are refused, and "Passed away" closes the request.

**Tech Stack:** SvelteKit 2, Svelte 5 runes, Drizzle, zod 4, `sveltekit-superforms`, svelte-sonner, Paraglide JS, Vitest (unit and integration), Playwright. No new dependency.

**Spec:** `docs/superpowers/specs/2026-10-27-membership-design.md`: decisions 3, 4, 5, 17 and 18, the calls "Non-member records", "Newborns and other new members added by a family", "Got married, as a family" and "Member IDs are assigned at approval", the "Data changes" for `registrations`, flows 1–3, and "Depends on" (the outbox). It builds on plans `2026-10-27-membership-2a-registration-backend.md`, `2026-11-05-membership-4a-passed-away-moved-out.md` and `2026-11-05-membership-4b-got-married.md`. `CLAUDE.md`, `DESIGN.md`, `src/routes/(admin)/DESIGN.md`, `src/routes/(member)/DESIGN.md` and `src/lib/components/DESIGN.md` are binding.

**Builds on a change in flight:** another branch adds "children under 17 move with the last adult who leaves a household" inside `marry()` and the move functions. Rebase onto it before Task 2 and keep that behaviour when changing `marry()`'s signature. Approval and decline get it for free because they call `marry()`.

## User decisions (2026-11-05)

1. **Spouse form, family side: a short form, and staff complete it.** The family enters only the spouse's full name, nickname, sex and birth date. They may add an email or a phone for the spouse's own login, validated like registration contacts. The branch admin fills in the rest when approving: birth city, occupation, education, previous church, baptism and sidi, plus NIK and Chinese name if wanted. These are the remaining `personSchema` fields a member and their `member_profiles` row need. The address is the couple's new address, as the family gave it.
2. **Queue: the same Registrations queue.** The request shows there with a "Marriage" label. It shows the couple, the wedding date, the new address and the spouse's details, and it counts in the same nav badge. The admin can approve it (after completing the fields), send it back with a reason, or decline it.
3. **Send-back is fixed in My household.** The family adult is signed in. My household shows "Needs a fix" with the admin's reason and opens the same short form, pre-filled. Resubmitting returns the request to pending. The adult also gets a WhatsApp or email notice pointing to My household. There is no token link.
4. **Staff path: no queue.** When staff record a marriage to someone new who wants to be a member, the spouse is created as a member at once, with a Member ID, a profile, and an unactivated login if an email or phone is given. The staff "Got married" dialog gains this choice. The full member fields open on a separate staff page (see Decision D8).

## Defaults (the user may change these)

5. **While a marriage waits for approval:**
   - "Got married" and "Moved out" are blocked for the person who is marrying. They are hidden, and the server refuses them, for family and staff alike.
   - My household shows "Marriage waiting for approval" on that person's row.
   - "Passed away" stays allowed. It closes the open request (status `declined`) in the same transaction.
6. **Decline:** the marriage is still a fact. The couple moves and the spouse is saved as a non-member record, exactly as in 4b. Only membership is refused. The family adult is told.
7. **Duplicates:** the existing same-name-and-birth-date match (`findSameNameAndBirth`) runs on the spouse and the matches are shown to the admin. The admin can choose "This is the existing person". That records the marriage with the existing person, as `recordMarriageToMember` does in 4b, and creates no new record. Or the admin approves the spouse as a new person.
8. **Notices:**
   - The adult who submitted is told on approve, send-back and decline.
   - On approval, a new spouse who gave an email or phone also gets the activation steps for their own login, through the existing `registration_approved` message.

## Decisions this plan makes

- **D1. Storage: extend `registrations`, not a new table.** The queue, the badge, `claim()`, the review scope, the audit entity and the outbox notices all key on `registrations`, so a separate table would duplicate each of them.
  - Added columns:
    - `kind` (`new_household`, the default, or `marriage`);
    - `subject_person_id`, the marrying person;
    - `submitted_by_person_id`.
  - `registration_link_id` becomes nullable.
  - The status enum gains `declined`.
  - The wedding date, address and short spouse form go in `payload`, validated by `marriageRequestSchema`.
- **D2. `subject_person_id`, not the spec's `target_household_id`.** A marriage makes a new household rather than adding to one. The subject's current household is read fresh under the lock at approval, so a stored copy could only go stale.
- **D3. One open request per person is a DB constraint.** The partial unique index `registrations_open_marriage_uniq` covers `subject_person_id` where `status in ('pending','needs_fix')`. It also serves My household's lookup.
- **D4. Notices reuse `noticeTo(reg)`.** At submit and resubmit, `contact_email`, `contact_phone` and `locale` are copied from the submitter's own account, through a new `auth` service function `accountContact`. The existing `registrations_contact` check keeps holding.
- **D5. One new outbox template, `marriage_update`, for approve, needs-fix and decline.**
  - WhatsApp gets one fixed text, with the parameters `subject`, `spouse` and `householdUrl`. That is one more Meta template, not three.
  - Email picks its body by `params.outcome` and carries the reason, as `registration_needs_fix` does.
- **D6. `marry(tx, couple, wedding, addSpouse?, metadata?)`.** The fourth parameter becomes a writer callback, `SpouseWriter`. It inserts the new person into the new household and returns its id and its `person.created` audit row. This way one move, lock and spouse-link path serves 4b, decline, approval and the staff path.
- **D7. Lock order: the registration row, then households, then people.** "Passed away" closes the request before it sets `deceased_on`, so a death racing an approval waits on the registration row instead of deadlocking.
- **D8. Staff member fields go on a page: `/members/[id]/married`.** There are about 14 fields, including a city search and two conditional sacrament groups. In a 90dvh dialog they scroll badly and cannot show per-field superforms errors as the registration form does. The dialog keeps its two short choices and gains a third that links to the page.
- **D9. Who may submit, see and fix a request:** anyone `lifeChangeActor(subject)` allows (a family adult who is direct family, or a household adult for a child), plus staff. Notices go to whoever last submitted or resubmitted.
- **D10. Who may decide:** `reviewScope()` (`branch_admin`, `superadmin`) over `registrations.branch_id`, which is the subject's home branch at submit time.

## Global Constraints

- **Layers:**
  - Each route calls one service function.
  - Only repositories touch `db` / `tx`.
  - The member module calls registration **services** (`marriage-store.ts`, `new-member.ts`, `decide.ts`), never registration repositories, and the reverse holds too.
  - `marriage-store.ts` and `new-member.ts` import nothing from `member/`, so no import cycle forms.
- **No query in a loop.** The household list gets the open requests with one `inArray` query.
- **The marriage rules are checked at submit, at resubmit, and again inside the deciding transaction.** These are 4b's rules:
  - each spouse is alive;
  - each spouse is `MARRIAGE_AGE` (19) or over on the wedding date;
  - neither has a live spouse row;
  - the wedding is not after today in the subject's branch timezone.
- **Errors are message keys.**
  - New keys: `error_marriage_waiting`, `error_nik_taken`.
  - Reused keys: `error_already_decided`, `error_contact_taken`, `error_spouse_unavailable`, `error_same_person`, and 4b's keys.
- **Audit**, written by `recordAudit` / `recordAudits` inside the transaction. `diff` holds only the changed fields; a create stores `after` values only. A NIK appears only as `{ nik: { changed: true } }`.

  | Action                     | Entity                      | Diff                                                                                                                                                                                  | Metadata                                    |
  | -------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
  | `registration.submitted`   | registration                | `kind`, `subjectPersonId`, `weddingOn` (after)                                                                                                                                        | `actedAs` (family)                          |
  | `registration.resubmitted` | registration                | `status` needs_fix → pending                                                                                                                                                          |                                             |
  | `registration.needs_fix`   | registration                | `status` pending → needs_fix, `fixReason` (after)                                                                                                                                     |                                             |
  | `registration.approved`    | registration                | `status` pending → approved, `householdId`, `spouseId` (after)                                                                                                                        |                                             |
  | `registration.declined`    | registration                | `status` pending → declined, `householdId` (after)                                                                                                                                    |                                             |
  | `registration.closed`      | registration                | `status` pending or needs_fix → declined                                                                                                                                              | `{ reason: 'passed_away' }`                 |
  | `person.married`           | person, per existing spouse | as in 4b                                                                                                                                                                              | `{ registrationId }` on approve and decline |
  | `person.created`           | person                      | member: `fullName`, `nickname`, `sex`, `birthDate`, `isMember: true`, `memberCode`, `householdId`, `addressLine`, `postalCode`, `cityId`, and `nik` when given. Non-member: as in 4b. |                                             |

- The audit branch is the subject's home branch.
- **Member screens:**
  - 18px body text, 48px tap targets, and a 56px full-width main action;
  - a long form is split into steps, with "Step 1 of 2" in words;
  - yes/no questions use `YesNo`;
  - a toast follows an action;
  - no `confirm()`.
- All copy comes from Paraglide in `en`, `id`, `zh-Hans` and `zh-Hant`. Functions stay under ~40 lines and files under ~200 lines. Comments say why.

## Review Focus

1. **A death and an approval at the same moment** must leave exactly one outcome and never a deadlock or a 500. Either the request is approved and the death is recorded after it, or the request is closed and the approval gets `error_already_decided`. Test in Task 5.
2. **Approving with a spouse email that already has an account** must refuse with `error_contact_taken` and leave nothing behind: no household, no person, no Member ID number used, and the request still pending. Test in Task 5.
3. **A family adult on a stale "Needs a fix" page** resubmits after the admin already declined. The resubmit is refused with `error_already_decided` and the stored request is unchanged. Test in Task 3.
4. **The old household-registration actions** (`approveRegistration`, `requestFix`, `markSpam`) called with a marriage request's id must answer `NotFoundError`. They must not build a household from a payload that has no `people`. Test in Task 5.
5. **A family request and a staff "Got married" for the same person at once** must give one result: either a waiting request or a recorded marriage, never both. Test in Task 4.

---

## File Map

| File                                                                                          | Responsibility                                                                                               |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `src/lib/server/db/schema/registration.ts`, `drizzle/0007_*.sql`                              | `kind`, `subject_person_id`, `submitted_by_person_id`, nullable link, `declined`, checks, open-request index |
| `src/lib/server/db/test/factories.ts`, `e2e-db.ts`                                            | `makeMarriageRequest()`, `e2eMarriageRequest()`                                                              |
| `src/lib/life-change/schema.ts`                                                               | `marriageRequestSchema`, `memberSpouseSchema`, `marriedNewMemberSchema`                                      |
| `src/lib/server/modules/audit/service.ts`                                                     | export `RecordAuditInput`                                                                                    |
| `src/lib/server/modules/auth/service.ts`                                                      | `accountContact()`                                                                                           |
| `src/lib/server/modules/registration/new-member.ts`                                           | `createMember()`, `activationNotice()`, `profileRow()` (moved from `approve.ts`)                             |
| `src/lib/server/modules/registration/marriage-store.ts`, `marriage-store-repository.ts`       | insert, reopen, list open, close, set household                                                              |
| `src/lib/server/modules/registration/marriage-decide.ts`                                      | `approveMarriage()`, `approveMarriageToExisting()`, `requestMarriageFix()`, `declineMarriage()`              |
| `src/lib/server/modules/registration/marriage-review.ts`                                      | the review view of a marriage request                                                                        |
| `src/lib/server/modules/registration/decide.ts`, `decide-repository.ts`                       | `claim()` filters by `kind`                                                                                  |
| `src/lib/server/modules/registration/review-repository.ts`, `review-service.ts`               | queue rows and detail know `kind`                                                                            |
| `src/lib/server/modules/messaging/{sender,email,whatsapp}.ts`                                 | `marriage_update` template                                                                                   |
| `src/lib/server/modules/member/married.ts`                                                    | `SpouseWriter`, `nonMemberSpouse()`, `assertSpouseOldEnough()`, open-request check under the lock            |
| `src/lib/server/modules/member/married-member.ts`                                             | `recordMarriageToNewMember()` (staff)                                                                        |
| `src/lib/server/modules/member/marriage-request.ts`                                           | `submitMarriageRequest()`, `resubmitMarriageRequest()`, `getMarriageScreen()`                                |
| `src/lib/server/modules/member/{moved-out,passed-away,household-service}.ts`                  | hold the person while a request is open                                                                      |
| `src/lib/components/PersonFields.svelte`, `MarriageDialog.svelte`, `SpouseShortFields.svelte` | `hideRelation` prop, third choice, the family's short form                                                   |
| `src/routes/(admin)/registrations/…`                                                          | queue label, `MarriageReview.svelte`, four actions; `FixDialog` gains `action` and `description` props       |
| `src/routes/(admin)/members/[id]/married/…`                                                   | staff member-spouse page                                                                                     |
| `src/routes/(member)/profile/household/…`                                                     | yes/no choice, request, waiting and needs-fix states, resubmit                                               |
| `messages/*.json`                                                                             | new keys in 4 locales                                                                                        |

---

### Task 1: Data model and shared schemas

**Files:**

- Modify: `src/lib/server/db/schema/registration.ts`
- Create: `drizzle/0007_*.sql` (generated)
- Modify: `src/lib/server/db/test/factories.ts`
- Modify: `src/lib/life-change/schema.ts`, `src/lib/life-change/schema.test.ts`
- Create: `src/lib/server/modules/registration/marriage-schema.int.test.ts`

**Interfaces:**

- Produces:
  - `registrationKindEnum = pgEnum('registration_kind', ['new_household', 'marriage'])`.
  - `registrationStatusEnum` gains `'declined'`.
  - `registrations` changes:
    - `kind` (not null, default `'new_household'`);
    - `registrationLinkId` becomes nullable;
    - `subjectPersonId` and `submittedByPersonId` are added (uuid, FK `people`, `restrict`).
  - Checks:
    - `registrations_link_kind`: `(kind = 'new_household') = (registration_link_id is not null)`;
    - `registrations_subject_kind`: `(kind = 'marriage') = (subject_person_id is not null)`.
  - Partial unique index `registrations_open_marriage_uniq` on `(subject_person_id)` `where status in ('pending','needs_fix')`.
  - `makeMarriageRequest(o: { subjectPersonId; branchId; submittedByPersonId?; status?; fixReason?; payload? })`. It defaults to the payload `{ weddingOn: '2026-06-01', address: {…}, spouse: { fullName: 'Rani Putri', nickname: 'Rani', sex: 'female', birthDate: '1999-02-02' } }`, `contactEmail: 'family@mail.test'` and `locale: 'en'`.
  - Schemas in `src/lib/life-change/schema.ts`:
    - `marriageRequestSchema`: `marriedNewSchema` with `spouse` extended by `email` and `phone` from `personSchema.shape`. `type MarriageRequestInput = z.infer<…>`.
    - `memberSpouseSchema = personSchema.omit({ relation: true, notChildOfSpouse: true })`. Its `address` is the couple's new address. `type MemberSpouse = z.infer<…>`.
    - `marriedNewMemberSchema = z.object({ weddingOn: pastDate, spouse: memberSpouseSchema })`.

- [ ] **Step 1: Write the failing tests:**
  - `schema.test.ts`:
    - `marriageRequestSchema` accepts a spouse with no email or phone.
    - It turns phone `'0812 3456 7890'` into `'+6281234567890'`.
    - It rejects email `'x@'` with `error_invalid_email`.
    - `memberSpouseSchema` rejects a missing `birthCityId` with `error_required`, and accepts `baptism: { baptized: false }`.
    - `marriedNewMemberSchema` rejects `weddingOn: ''` with `error_required`.
  - `marriage-schema.int.test.ts`:
    - A `marriage` row without `subjectPersonId` violates `registrations_subject_kind`.
    - A `new_household` row with a null link violates `registrations_link_kind`.
    - A second open marriage request for the same subject violates `registrations_open_marriage_uniq`. After the first is set to `declined`, a second insert succeeds.
    - A row made by `makeRegistration()` reads `kind: 'new_household'`.

- [ ] **Step 2: Run** `bun run test:unit -- --run src/lib/life-change` and `bun run test:int src/lib/server/modules/registration/marriage-schema` → FAIL.

- [ ] **Step 3: Implement.**
  - Edit the schema, then run `bun run db:generate`.
  - Check the SQL. `ALTER TYPE … ADD VALUE 'declined'` must not be used later in the same migration. Nothing here uses it.
  - Run `bun run db:migrate` against dev, and let the test setup migrate the test DB.
  - Existing `insertRegistration` code passes a link, so it keeps working.

- [ ] **Step 4: Run** both commands, plus `bun run test:int src/lib/server/modules/registration` (the existing registration tests stay green) → PASS.

- [ ] **Step 5: Commit** `feat(registration): marriage requests in the registrations table`

---

### Task 2: Create a member in a caller's transaction; staff marry someone new as a member

**Files:**

- Modify: `src/lib/server/modules/audit/service.ts` (`export type RecordAuditInput`)
- Create: `src/lib/server/modules/registration/new-member.ts`
- Modify: `src/lib/server/modules/registration/approve.ts` (import `profileRow` from `new-member.ts`), `approve-repository.ts` (`nikTaken`)
- Modify: `src/lib/server/modules/member/married.ts`, `married.int.test.ts` (the stale-subject test passes `nonMemberSpouse({...})`)
- Create: `src/lib/server/modules/member/married-member.ts`, `married-member.int.test.ts`

**Interfaces:**

- Consumes: Task 1 `MemberSpouse`, `marriedNewMemberSchema`; `nextMemberCode`, `yearIn`, `encryptNik`, `keyedHash`; `approve-repository`'s `insertPeople`, `insertProfiles`, `insertAccounts`, `contactTaken` and `findBranch`.
- Produces:
  - `nikTaken(tx: Transaction, nikHash: string): Promise<boolean>`. It checks live people only.
  - `createMember(tx: Transaction, person: MemberSpouse, at: { householdId: string; homeBranchId: string; locale: string } & Address): Promise<{ id: string; memberCode: string; audit: RecordAuditInput }>`.
    - It throws `error_contact_taken` or `error_nik_taken` before any insert.
    - It uses `at` for the address; `person.address` is ignored.
    - The account is unactivated.
  - `activationNotice(person: { fullName: string; email?: string; phone?: string }, locale: Locale): OutgoingMessage | null`. It uses template `registration_approved` with params `{ name, activateUrl: `${config.ORIGIN}/activate`, someoneNotAdded: 'no' }`. It goes by email when there is one, else by WhatsApp, and returns `null` with no contact.
  - In `married.ts`:
    - `type SpouseWriter = (tx: Transaction, at: Home & repo.Address) => Promise<{ id: string; audit: RecordAuditInput }>`.
    - `marry(tx, couple, w, addSpouse?: SpouseWriter, metadata?: object)`.
    - `nonMemberSpouse(spouse: NewSpouse): SpouseWriter`. This is today's `insertPerson` plus `createdAudit`.
    - `assertSpouseOldEnough(birthDate: string, weddingOn: string): void`. It throws `error_not_marriage_age`.
    - `toAddress` is exported.
  - `recordMarriageToNewMember(personId: string, input: unknown): Promise<{ householdId: string; spouseId: string; memberCode: string }>`. It is staff only, through `staffOnly`.

- [ ] **Step 1: Write the failing tests** in `married-member.int.test.ts`. Reuse the `family()` and `input` shape from `married.int.test.ts`, with the spouse completed: birth city, `occupation: 'employee'`, `education: 'bachelor'`, `previousChurch: null`, `baptism: { baptized: false }`, `sidi: { sidi: false }` and `email: 'rani@mail.test'`.
  - `staff marry someone new as a member`:
    - The spouse has `isMember: true` and a `memberCode` matching `^${branch.code}-\d{4}-\d{5}$`.
    - It has 1 `member_profiles` row with `occupation: 'employee'`.
    - It has 1 account with email `rani@mail.test` and `activatedAt: null`.
    - The couple shares a new household with the submitted address, and there is 1 spouse link.
    - `person.created` has `isMember: { after: true }` and `memberCode: { after: <code> }`, and no `nik` key.
    - The outbox holds 1 `registration_approved` message to `rani@mail.test`.
  - `a NIK is stored encrypted and audited as changed`: with NIK `'3174012345670009'`, `people.nikHash` equals `keyedHash(nik)` and the audit's `nik` is `{ changed: true }`.
  - `no contact, no account and no notice`.
  - `an email that already has an account is refused and nothing is written`. Give another person's account `rani@mail.test`:
    - The call fails with `error_contact_taken`.
    - The household count is unchanged.
    - `member_code_counters` has no row for the branch.
    - The subject's `householdId` is unchanged.
  - `a NIK already on record is refused` → `error_nik_taken`.
  - `the new spouse must be 19 on the wedding date` → `error_not_marriage_age`.
  - `a family adult cannot use it` → `NotFoundError`.

- [ ] **Step 2: Run** `bun run test:int src/lib/server/modules/member/married-member` → FAIL.

- [ ] **Step 3: Implement.**
  - Move `profileRow` into `new-member.ts`. `approve.ts` imports it.
  - `recordMarriageToNewMember`:
    1. `subjectOf`.
    2. `staffOnly`.
    3. `parseWith(marriedNewMemberSchema)`.
    4. `assertMayMarry`.
    5. `assertSpouseOldEnough`.
    6. One transaction: `marry(tx, [subject], wedding, writer)`. The writer calls `createMember(tx, spouse, { ...at, locale: 'id' })` and keeps `memberCode`; `'id'` is the column default, and the member changes it after sign-in. Inside the same transaction, `enqueueMessage(tx, activationNotice(...))` when a contact was given.
    7. After commit, `deliverAfterCommit`.

- [ ] **Step 4: Run** `bun run test:int src/lib/server/modules/member/married src/lib/server/modules/registration/approve` → PASS (4b and registration approval stay green).

- [ ] **Step 5: Commit** `feat(member): staff marry someone new as a member`

---

### Task 3: Families submit and resubmit a marriage request

**Files:**

- Modify: `src/lib/server/modules/auth/service.ts`
- Create: `src/lib/server/modules/registration/marriage-store.ts`, `marriage-store-repository.ts`
- Create: `src/lib/server/modules/member/marriage-request.ts`, `marriage-request.int.test.ts`

**Interfaces:**

- Consumes: Task 1; 4a/4b `subjectOf`, `lifeChangeActor`, `actedAs`, `assertMayMarry`, `assertSpouseOldEnough`, `parseWith`, `lockHouseholds`, `hasLiveSpouse`, `getHouseholdMember`.
- Produces:
  - `accountContact(personId: string): Promise<{ email: string | null; phone: string | null; preferredLocale: string } | null>`. It wraps `findContactByPersonId`.
  - `marriage-store.ts` (registration services):
    - `insertMarriageRequest(tx, row: { branchId; subjectPersonId; submittedByPersonId; payload: MarriageRequestInput; locale; contactEmail; contactPhone }): Promise<string | null>`. It returns `null` when an open request exists, using `onConflictDoNothing`.
    - `reopenMarriageRequest(tx, subjectPersonId: string, set: { payload; submittedByPersonId; locale; contactEmail; contactPhone }): Promise<{ id: string; branchId: string } | null>`. It sets `needs_fix → pending`, `fixReason: null` and `submittedAt: now`, guarded on `status = 'needs_fix'`.
    - `openMarriageRequests(personIds: string[], tx?): Promise<Map<string, { id: string; status: 'pending' | 'needs_fix'; fixReason: string | null; payload: MarriageRequestInput }>>`. It is one `inArray` query.
  - `marriage-request.ts` (member services):
    - `submitMarriageRequest(personId: string, input: unknown): Promise<{ id: string }>`
    - `resubmitMarriageRequest(personId: string, input: unknown): Promise<void>`
    - `getMarriageScreen(personId: string): Promise<{ person: Awaited<ReturnType<typeof getHouseholdMember>>; request: { status: 'pending' | 'needs_fix'; reason: string | null; input: MarriageRequestInput } | null }>`

- [ ] **Step 1: Write the failing tests** in `marriage-request.int.test.ts`. Use 4b's `family()`. The parent also gets `makeAccount(parent.id, { email: 'family@mail.test' })`.
  - `a household adult submits a marriage request`: as the parent, one `registrations` row exists with:
    - `kind: 'marriage'`, `status: 'pending'`;
    - `branchId` = the subject's home branch;
    - `subjectPersonId` = the subject, `submittedByPersonId` = the parent;
    - `contactEmail: 'family@mail.test'`;
    - `payload.spouse.fullName` = `'Rani Putri'`.

    Nothing else changes yet:
    - The subject stays in the old household.
    - No new `people` row and no spouse link exist.
    - `registration.submitted` has metadata `{ actedAs: 'parent' }`.

  - `the request counts in the registration badge`: `asStaff('branch_admin', branch.id, countPendingRegistrations)` → `1`.
  - `two requests for the same person make one`:
    - A second call → `error_marriage_waiting`.
    - Two calls at once through `Promise.allSettled` → one fulfilled, one rejected with `error_marriage_waiting`, and 1 row.
  - `the marriage rules apply at submit`:
    - A subject born `'2007-06-02'` with wedding `'2026-06-01'` → `error_not_marriage_age`.
    - A subject with a live spouse row → `error_already_married`.
  - `an adult who is not direct family gets NotFoundError`: an unrelated adult in the household.
  - `resubmit after a send-back returns it to pending`: `makeMarriageRequest({ status: 'needs_fix', fixReason: 'Wrong birth date' })`, then resubmit with `birthDate: '1999-03-03'`:
    - The status is `pending`, `fixReason` is null, and `payload.spouse.birthDate` is `'1999-03-03'`.
    - One `registration.resubmitted` row exists.
  - `resubmit after a decision is refused` (Review Focus 3): a request with status `declined` → `error_already_decided`, and the payload is unchanged.
  - `getMarriageScreen returns the open request with its reason`: `{ status: 'needs_fix', reason: 'Wrong birth date', input.spouse.fullName: 'Rani Putri' }`.

- [ ] **Step 2: Run** `bun run test:int src/lib/server/modules/member/marriage-request` → FAIL.

- [ ] **Step 3: Implement.**
  - `submitMarriageRequest`:
    1. `subjectOf`.
    2. `lifeChangeActor`.
    3. The submitter is `getContext().personId`. Without one, or without an `accountContact`, throw `NotFoundError`.
    4. Parse.
    5. `assertMayMarry`.
    6. `assertSpouseOldEnough`.
    7. One transaction:
       1. `lockHouseholds([subject.householdId])`.
       2. `hasLiveSpouse(subject.id, tx)` → `error_already_married`.
       3. `insertMarriageRequest`; `null` → `error_marriage_waiting`.
       4. Audit.
  - Do not check spouse contacts here: telling the family that an email "is taken" would reveal an account. The admin meets `error_contact_taken` at approval and sends the request back.
  - `resubmitMarriageRequest` runs the same checks. It then calls `reopenMarriageRequest`; `null` → `error_already_decided`.

- [ ] **Step 4: Run** → PASS.

- [ ] **Step 5: Commit** `feat(member): families ask for a new spouse to become a member`

---

### Task 4: A waiting marriage holds the person

**Files:**

- Modify: `src/lib/server/modules/registration/marriage-store.ts`, `marriage-store-repository.ts`. Add `closeMarriageRequests` and `setRegistrationHousehold`; the second is used in Task 5.
- Modify: `src/lib/server/modules/member/married.ts`, `moved-out.ts`, `passed-away.ts`, `household-service.ts`
- Modify: `married.int.test.ts`, `moved-out.int.test.ts`, `passed-away.int.test.ts`, `household.int.test.ts`

**Interfaces:**

- Produces:
  - `closeMarriageRequests(tx, personId: string): Promise<{ id: string; branchId: string; before: 'pending' | 'needs_fix' }[]>`. It sets `status: 'declined'`, `decidedAt` and `decidedByPersonId` = the context person.
  - `setRegistrationHousehold(tx, id: string, householdId: string): Promise<void>`
  - `marry()` throws `error_marriage_waiting` when `openMarriageRequests(couple ids, tx)` is not empty. This check runs after `lockHouseholds`. Approval and decline flip their own row's status before calling `marry()`, so they pass.
  - `canMarry()` and `moveOutRefusal()` also return false or `error_marriage_waiting` for an open request.
  - `HouseholdPerson` gains `marriageRequest: { status: 'pending' | 'needs_fix'; reason: string | null } | null`. `canMarry` and `canMoveOut` are false while it is set.

- [ ] **Step 1: Write the failing tests:**
  - `married.int.test.ts`:
    - `a person with a waiting request cannot be married`: `recordMarriage` and `recordMarriageToMember` with that person on either side → `error_marriage_waiting`. `canMarry` is false.
    - `a family request and a staff marriage at once make one` (Review Focus 5): `Promise.allSettled([asPerson(parent, submitMarriageRequest), asAdmin(recordMarriage)])` → exactly one fulfilled.
      - If the request won: 0 spouse links.
      - If the marriage won: 0 `registrations` rows.
  - `moved-out.int.test.ts`: `moving out is refused while a marriage waits` → `error_marriage_waiting`, and `canMoveOut` is false.
  - `passed-away.int.test.ts`: `a death closes a waiting marriage request`:
    - The status is `declined` and `decidedAt` is set.
    - `registration.closed` has diff `{ status: { before: 'pending', after: 'declined' } }` and metadata `{ reason: 'passed_away' }`.
    - No new person or household exists.
  - `household.int.test.ts`: `a waiting marriage shows on the row and hides got married and moved out`:
    - A pending request → `marriageRequest: { status: 'pending', reason: null }`, `canMarry: false`, `canMoveOut: false`.
    - A needs-fix request → `reason: 'Wrong birth date'`.

- [ ] **Step 2: Run** `bun run test:int src/lib/server/modules/member` → FAIL.

- [ ] **Step 3: Implement.**
  - In `recordPassedAway`, call `closeMarriageRequests` as the **first** statement of the transaction, before `setDeceasedOn`, and comment the lock order (D7).
  - `getMyHousehold` adds `openMarriageRequests(ids)` to its existing `Promise.all`.

- [ ] **Step 4: Run** → PASS.

- [ ] **Step 5: Commit** `feat(member): a waiting marriage holds the person`

---

### Task 5: The admin approves, sends back or declines

**Files:**

- Modify: `src/lib/server/modules/registration/decide.ts`, `decide-repository.ts`
- Modify: `src/lib/server/modules/messaging/sender.ts`, `email.ts`, `whatsapp.ts`, `sender.test.ts`, `whatsapp.test.ts`
- Create: `src/lib/server/modules/registration/marriage-decide.ts`, `marriage-decide.int.test.ts`
- Modify: `messages/*.json` (the email copy)

**Interfaces:**

- Consumes: Tasks 2–4; `claim`, `decided`, `noticeTo`, `deliverAfterCommit`, `reviewScope`, `findSameNameAndBirth`; member `subjectOf`, `assertMayMarry`, `assertSpouseOldEnough`, `marriageRefusal`, `marry`, `nonMemberSpouse`, `toAddress`.
- Produces:
  - `claim(tx, id, set, kind: 'new_household' | 'marriage' = 'new_household')`. `claimPending` adds `eq(registrations.kind, kind)`. `findInScope` returns `kind`, and a different kind throws `NotFoundError`.
  - `parseReason(input: string): string`. This is the existing `reasonSchema` parse, exported.
  - `MessageTemplate` gains `'marriage_update'`.
    - WhatsApp `bodyParams`: `['subject', 'spouse', 'householdUrl']`.
    - Email picks its body by `params.outcome` (`approved`, `needs_fix`, `declined`); the needs-fix body includes `params.reason`.
  - In `marriage-decide.ts`:
    - `approveMarriage(id: string, input: unknown): Promise<{ householdId: string; spouseId: string }>`. The input is `MemberSpouse`. A parse failure throws `ValidationError('error_invalid_registration', issues)`.
    - `approveMarriageToExisting(id: string, personId: string): Promise<{ householdId: string }>`
    - `requestMarriageFix(id: string, reason: string): Promise<void>`
    - `declineMarriage(id: string): Promise<{ householdId: string; spouseId: string }>`
  - Notice params: `{ outcome, subject: subject.fullName, spouse: <spouse name>, householdUrl: `${config.ORIGIN}/profile/household`, reason }`. The reason is set only for needs-fix by email, and is `''` otherwise.

- [ ] **Step 1: Write the failing tests** in `marriage-decide.int.test.ts`. The fixture is 4b's `family()`, a parent account, and `makeMarriageRequest` submitted by the parent. `complete` is the payload spouse plus Task 2's member fields, with `email: 'rani@mail.test'`. Every call runs as `asAdmin(branch.id)`.
  - `approve makes the spouse a member and marries the couple`:
    - The request has `status: 'approved'`, `householdId` and `decidedByPersonId` set.
    - The spouse is a member with a Member ID, a profile and an unactivated account.
    - The couple is in a new household with the request's address.
    - The spouse link has `startedOn: '2026-06-01'`.
    - Audits:
      - `registration.approved`: diff `{ status: { before: 'pending', after: 'approved' }, householdId: { after }, spouseId: { after } }`;
      - `person.married` for the subject, with metadata `{ registrationId: id }`;
      - `person.created` with `isMember: { after: true }`.
    - The outbox holds `marriage_update` to `family@mail.test` with `params.outcome: 'approved'`, and `registration_approved` to `rani@mail.test`.
  - `the admin's corrections win`: `nickname: 'Ra'` is stored.
  - `approve re-checks the rules`:
    - A live spouse row inserted for the subject after submit → `error_already_married`.
    - `deceasedOn` set directly → `error_already_deceased`.
    - In both cases the status stays `pending`.
  - `approving twice at once makes one member`: `Promise.allSettled` → one fulfilled, the other `error_already_decided`, and 1 person named `'Rani Putri'`.
  - `approve and decline at once: one wins`.
  - `a death and an approval at once: one outcome, no deadlock` (Review Focus 1): `Promise.allSettled([approve, asPerson(parent, recordPassedAway(subject))])`.
    - No rejection other than a `ValidationError` with `error_already_decided` or `error_already_deceased`.
    - If the approval was rejected: the status is `declined` and no new member exists.
    - If it was fulfilled: the status is `approved`.
  - `a contact already in use is refused and nothing is written` (Review Focus 2):
    - The call fails with `error_contact_taken`.
    - The status stays `pending` and `householdId` stays null.
    - The household count is unchanged.
    - `member_code_counters` has no row for the branch.
  - `this is the existing person`: a member `'Rani Putri'` born `'1999-02-02'` in the same branch.
    - `approveMarriageToExisting` creates no new person.
    - The couple is in the new household and the status is `approved`.
    - No `registration_approved` message is sent.
  - `an existing person who is not a match is refused` → `error_spouse_unavailable`.
  - `send back`: `requestMarriageFix(id, 'Wrong birth date')`:
    - `status: 'needs_fix'`, `fixReason` stored, and `fixTokenHash` null.
    - `marriage_update` is sent with `outcome: 'needs_fix'`. `reason` is `'Wrong birth date'` by email, and `''` when the request has only a phone.
    - `householdUrl` ends with `/profile/household`.
    - One `registration.needs_fix` row exists.
  - `decline records the marriage with a non-member spouse`:
    - `status: 'declined'`.
    - The spouse has `isMember: false`, no profile and no account.
    - The couple has moved.
    - `registration.declined` has diff `{ status: { before: 'pending', after: 'declined' }, householdId: { after } }`.
    - `marriage_update` is sent with `outcome: 'declined'`.
  - `an admin of another branch can neither see nor decide it` (D10): `approveMarriage` → `NotFoundError`, and `listRegistrations` for that admin does not include the id.
  - `household actions refuse a marriage request` (Review Focus 4):
    - `approveRegistration`, `requestFix` and `markSpam` on the marriage id → `NotFoundError`, and the status stays `pending`.
    - `approveMarriage` on a household registration → `NotFoundError`.
  - `sender.test.ts` and `whatsapp.test.ts`: `marriage_update` builds body params `[subject, spouse, householdUrl]`, and the email subject and body contain the spouse's name.

- [ ] **Step 2: Run** `bun run test:int src/lib/server/modules/registration/marriage-decide` and `bun run test:unit -- --run src/lib/server/modules/messaging` → FAIL.

- [ ] **Step 3: Implement.**
  - Each decision follows the same steps:
    1. Claim first, so a lost race fails before any write.
    2. `subjectOf(reg.subjectPersonId!)`.
    3. `assertMayMarry(subject, payload.weddingOn)`.
    4. The spouse age check, which approve runs on the admin's birth date.
    5. `marry(tx, …, writer, { registrationId })`.
    6. `setRegistrationHousehold`.
    7. Audit.
    8. Enqueue.
    9. `deliverAfterCommit` after the commit.
  - Approve uses the address in `input.address`; decline uses `payload.address`.
  - `approveMarriageToExisting` accepts only a `findSameNameAndBirth([payload.spouse])` match whose home branch is in `reviewScope()`; anything else throws `error_spouse_unavailable`. It then checks `error_same_person` and runs `marriageRefusal(existing, weddingOn)`.
  - New keys:
    - `marriage_update_email_subject`
    - `marriage_approved_email_body`
    - `marriage_needs_fix_email_body`
    - `marriage_declined_email_body`
    - `error_marriage_waiting`
    - `error_nik_taken`

    Each goes in all 4 locales.

  - The file has four exported functions plus a shared `decideIn(tx, id, status)` helper. Keep it under ~200 lines, and move the notice building to a small `marriage-notices.ts` if it grows past that.

- [ ] **Step 4: Run** both commands, plus `bun run test:int src/lib/server/modules/registration` → PASS.

- [ ] **Step 5: Commit** `feat(registration): approve, send back or decline a marriage request`

---

### Task 6: Queue label and the admin review screen

**Files:**

- Modify: `src/lib/server/modules/registration/review-repository.ts`, `review-service.ts`, `review.int.test.ts`
- Create: `src/lib/server/modules/registration/marriage-review.ts`
- Modify: `src/routes/(admin)/registrations/+page.svelte`, `[id]/+page.server.ts`, `[id]/+page.svelte`, `[id]/FixDialog.svelte`
- Create: `src/routes/(admin)/registrations/[id]/MarriageReview.svelte`
- Modify: `src/lib/components/PersonFields.svelte` (`hideRelation` prop), `components.svelte.test.ts`
- Modify: `e2e-db.ts` (`e2eMarriageRequest`)
- Create: `src/routes/(admin)/registrations/marriage.e2e.ts`
- Modify: `messages/*.json`

**Interfaces:**

- Produces:
  - `listQueue` and `listRegistrations` items gain `kind` and `subjectName: string | null`, taken from a left join of `people` on `subject_person_id`.
    - `registrantName` = `coalesce(payload->'people'->0->>'fullName', payload->'spouse'->>'fullName')`.
    - `peopleCount` = `coalesce(jsonb_array_length(payload->'people'), 1)`.
  - `findDetail` returns `kind`, plus the subject's `fullName` and `memberCode` and the submitter's `fullName`, through two `people` aliases in the same query.
  - `getRegistration(id)` returns today's shape with `kind: 'new_household'`. For a marriage it returns `marriageReview(row)`:
    ```ts
    {
      kind: 'marriage';
      id;
      status;
      branchName;
      fixReason;
      submittedAt;
      subject: { id; fullName; memberCode };
      submittedBy: string;
      weddingOn;
      address: { line; postalCode; cityId; city };
      spouse: MarriageRequestInput['spouse'];
      matches: Warning[];
      otherBranchMatch: boolean;
      draft: Partial<MemberSpouse>; // payload spouse + address, for the form
    }
    ```
  - `PersonFields` gets the prop `hideRelation?: boolean`, default `false`.
  - `FixDialog` gets the props `action = '?/fix'` and `description = m.registration_fix_body()`.
  - Page actions:
    - `approveMarriage`: `superValidate(request, zod4(memberSpouseSchema))`; an invalid form returns `fail(400, { form })`; then `approveMarriage`.
    - `approveExisting`: the field `personId`.
    - `fixMarriage`: the field `reason`.
    - `decline`.

- [ ] **Step 1: Write the failing tests:**
  - `review.int.test.ts`:
    - `the queue lists a marriage with its kind and both names` → `{ kind: 'marriage', subjectName: <subject>, registrantName: 'Rani Putri', peopleCount: 1 }`.
    - `a marriage review shows the couple, the date, the address and the matches`:
      - `kind: 'marriage'` and `weddingOn: '2026-06-01'`;
      - `address.city` is the city's name;
      - `matches[0].memberCode` is the same-name member's code;
      - the JSON holds no `nik`.
  - `components.svelte.test.ts`: `PersonFields with hideRelation shows no relation select`.
  - `marriage.e2e.ts` uses `e2eMarriageRequest()`, which builds `e2eFamily()` plus a pending marriage request for the child, submitted by the adult, in JKT.
    - `an admin completes and approves a marriage request`:
      1. `/registrations` shows the row "{child} & Rani …" with a "Marriage" pill.
      2. Open it. The heading names both, and the meta line shows the wedding date.
      3. Fill the birth city, the occupation and the education, tick "No previous church", and answer baptized No and sidi No.
      4. Press Approve → the toast "Approved" shows.
      5. The member list, searched for "Rani", shows a Member ID.
    - `an admin sends a marriage back and declines another`:
      1. Send one back with a reason → it is listed under the "Needs a fix" tab.
      2. Decline a second through the confirm dialog → the toast "Declined" shows.

- [ ] **Step 2: Run** `bun run test:int src/lib/server/modules/registration/review`, `bun run test:unit -- --run src/lib/components` and `npx playwright test src/routes/(admin)/registrations/marriage.e2e.ts` → FAIL.

- [ ] **Step 3: Implement.**
  - `+page.svelte` renders `MarriageReview` when `reg.kind === 'marriage'`, and the current view otherwise.
  - `MarriageReview` holds:
    - the header card (title "{subject} & {spouse}"; meta "Marriage · wedding {date} · submitted … · branch");
    - a card with the new address, the submitter, and the spouse's email or phone;
    - the matches, each with an outlined "This is the existing person" button (posting to `?/approveExisting`);
    - the completion form: `PersonFields` with `hideRelation`, the superforms `dataType: 'json'` pattern of `RegistrationForm`, and a filled "Approve" button;
    - `FixDialog` with `action="?/fixMarriage"` and the marriage description;
    - a `ConfirmDialog` "Decline" that names the spouse and says they will be saved as not a member.
  - New keys:
    - `registrations_kind_marriage`
    - `registration_marriage_title`
    - `registration_marriage_meta`
    - `registration_marriage_existing`
    - `registration_marriage_fix_body`
    - `registration_decline`
    - `registration_decline_title`
    - `registration_decline_body`
    - `registration_declined`
    - `registration_submitted_by`

    Each goes in all 4 locales.

- [ ] **Step 4: Run** → PASS. Run `bun run check` → clean.

- [ ] **Step 5: Commit** `feat(registration): review marriage requests in the registrations queue`

---

### Task 7: Staff "Someone new who wants to be a member"

**Files:**

- Modify: `src/lib/components/MarriageDialog.svelte`. Add a third radio, `member_married_new_member`. Choosing it shows `member_married_new_member_note` and a primary "Continue" link to `/members/{id}/married`, taken from the new prop `memberFormHref: string`.
- Modify: `src/routes/(admin)/members/[id]/+page.svelte`, which passes `memberFormHref`.
- Create: `src/routes/(admin)/members/[id]/married/+page.server.ts`, `+page.svelte`
- Modify: `src/routes/(admin)/members/life-change.e2e.ts`, `messages/*.json`

**Interfaces:**

- Consumes: Task 2 `recordMarriageToNewMember`, `marriedNewMemberSchema`; `getHouseholdMember`, which staff pass through `lifeChangeActor`.
- Produces:
  - The page load returns `{ person, form }`. `form` is `superValidate({ weddingOn: '', spouse: blank member spouse with address = person.address }, zod4(marriedNewMemberSchema), { errors: false })`.
  - The default action:
    1. `superValidate(request, zod4(marriedNewMemberSchema))`; an invalid form returns `fail(400, { form })`.
    2. `recordMarriageToNewMember`; a `ValidationError` becomes `message(form, key, { status: 400 })`.
    3. On success, `redirect(303, '/members/{id}?tab=family')`.

- [ ] **Step 1: Write the failing test** in `life-change.e2e.ts`, `an admin records a marriage to someone new who wants to be a member`:
  1. On the `e2eFamily` child, press "Got married".
  2. Choose "Someone new who wants to be a member", then Continue.
  3. Fill the wedding date, the name, the nickname, the sex, the birth date and the birth city, the occupation and the education. Tick "No previous church" and answer baptized No and sidi No.
  4. Confirm "Record the marriage" → the Family tab lists the spouse under "This household" with a Member ID matching `/^JKT-\d{4}-\d{5}$/`.

- [ ] **Step 2: Run** `npx playwright test src/routes/(admin)/members/life-change.e2e.ts` → FAIL.

- [ ] **Step 3: Implement.**
  - The page: an `h1` "Record a marriage" with the subject's name on the grey line, the wedding-date `Field`, `PersonFields` with `hideRelation`, and a `ConfirmDialog` submit.
  - The superforms json pattern is copied from `RegistrationForm`, so it jumps to the first field with an error.
  - New keys: `member_married_new_member`, `member_married_new_member_note`, `member_married_member_title`. Each goes in all 4 locales.

- [ ] **Step 4: Run** → PASS. Run `bun run check` → clean.

- [ ] **Step 5: Commit** `feat(member): staff marry someone new who wants to be a member`

---

### Task 8: Family screens: the choice, waiting, needs a fix, resubmit

**Files:**

- Create: `src/lib/components/SpouseShortFields.svelte`. These are step 1's fields moved out of the married page: name, nickname, sex, birth date and wedding date. It adds the `YesNo` "Does {name} want to be a GRII member?" and, on Yes, optional email and phone fields with the hint `field_contact_hint_other`.
  - Props:
    - `values?: Partial<MarriageRequestInput['spouse']> & { weddingOn?: string }`;
    - `member = $bindable<boolean | null>()`;
    - `subjectName: string`.
- Modify: `src/routes/(member)/profile/household/[id]/married/+page.server.ts`, `+page.svelte`
- Modify: `src/routes/(member)/profile/household/+page.svelte`, `household.e2e.ts`
- Modify: `e2e-db.ts` (`e2eMarriageRequest` takes `status` and `fixReason`), `messages/*.json`

**Interfaces:**

- Consumes: Task 3 `getMarriageScreen`, `submitMarriageRequest`, `resubmitMarriageRequest`; Task 4 `HouseholdPerson.marriageRequest`.
- Produces:
  - The load calls `getMarriageScreen(params.id)`.
  - The actions share one input builder that adds `email` and `phone` to today's fields:
    - `default`: unchanged, `recordMarriage` for a non-member;
    - `request`: `submitMarriageRequest`, then `redirect(303, '/profile/household?done=requested')`;
    - `resubmit`: `resubmitMarriageRequest`, then `?done=resubmitted`.

    Each action catches `ValidationError` → `fail(400, { error })`, as today.

- [ ] **Step 1: Write the failing tests** in `household.e2e.ts`:
  - `a member asks for their grown child's new spouse to become a member`:
    1. Tap "Got married: {child}".
    2. Fill step 1, answer Yes, and give the phone `0812 3456 7890`. Next.
    3. The address is pre-filled. Press "Send for approval" and confirm.
    4. Back on My household:
       - the toast "Sent to the church office for approval." shows;
       - the child's row shows "Marriage waiting for approval";
       - neither "Got married: {child}" nor "Move out: {child}" is shown.
  - `a member fixes a marriage request that was sent back`:
    1. Seed it with `e2eMarriageRequest({ status: 'needs_fix', fixReason: 'Wrong birth date' })`.
    2. My household shows "Needs a fix" and "Wrong birth date" on the child's row.
    3. Tap "Fix the marriage request: {child}". The full-name field holds `Rani …` and the reason shows at the top.
    4. Change the birth date, Next, Send.
    5. The toast "Sent again for approval." shows, and the row shows "Marriage waiting for approval".
  - The existing test `a member records their grown child's marriage` answers No and still passes.

- [ ] **Step 2: Run** `npx playwright test src/routes/(member)/profile/household/household.e2e.ts` → FAIL.

- [ ] **Step 3: Implement.**
  - The married page:
    - Step 1 renders `SpouseShortFields`.
    - The form's `action` is `?/request` when the answer is Yes, `?/resubmit` when the load returned a `needs_fix` request, and the default otherwise.
    - On Yes, the confirm text becomes `household_request_confirm`: "The church office reviews this first. {name} and their spouse move into their new household once it is approved."
    - A `needs_fix` request:
      - pre-fills the fields;
      - fixes the member answer to Yes;
      - shows the reason in a `--raised` box above step 1, as the register fix page does.
    - A `pending` request shows only `household_request_waiting` and a Back link.
  - On the household list:
    - a pending request shows `StatusPill tone="warning"` with "Marriage waiting for approval";
    - a needs-fix request shows the pill "Needs a fix", the reason (`break-words`), and an outlined member-size button "Fix the marriage request" whose `aria-label` names the person.
  - `done` gains `requested` and `resubmitted`.
  - New keys:
    - `household_wants_member`
    - `household_send_request`
    - `household_request_confirm`
    - `household_request_waiting`
    - `household_request_needs_fix`
    - `household_request_fix_named`
    - `household_done_requested`
    - `household_done_resubmitted`

    Each goes in all 4 locales.

- [ ] **Step 4: Run** the e2e test → PASS. Then run the full suite: `bun run check`, `bun run lint`, `bun run test:unit -- --run`, `bun run test:int` and `npx playwright test` → green.

- [ ] **Step 5: Commit** `feat(member): families ask for a new spouse's membership from my household`

---

## Not in this plan

- Newborns or other additions to an existing household (the spec's `household_addition`).
- Consent from an existing member who is chosen as "This is the existing person" (decision 19 style). The admin's choice stands, as in 4b's staff marriage.
- Showing a waiting marriage on the staff member record. The staff actions are hidden and refused there; the queue shows the request.
- A notice when "Passed away" closes a request.
- Matching the spouse against non-member records or other pending registrations. `findSameNameAndBirth` covers members only, as it does today.
- Undoing an approval or a decline, and divorce.
- The Meta approval of the WhatsApp template `marriage_update`. Until it exists, the log stub stands in, as for the other templates.
