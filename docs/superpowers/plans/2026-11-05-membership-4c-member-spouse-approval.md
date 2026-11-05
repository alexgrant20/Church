# Membership 4c: A New Spouse Who Wants to Be a Member — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a family records "Got married" and the new spouse wants to be a GRII member, the request goes into the branch's Registrations queue. The branch admin completes the member fields and approves it, sends it back, or declines it. If the spouse turns out to be someone already on record, the admin asks that person to consent, and the marriage is recorded with them only after they agree. The couple's move and the spouse link are written only on the admin's decision. Staff who record such a marriage themselves create the member at once.

**Architecture:** A marriage request is a `registrations` row with `kind = 'marriage'`. The payload holds the short spouse form, the wedding date and the new address. The marrying person is a column, `subject_person_id`.

- Approval, send-back and decline reuse registration's `claim()`, so one decision wins.
- Approve and decline both call 4b's `marry()` inside the claiming transaction. `marry()` takes a spouse-writer callback, so the same move writes a member spouse (approve, staff path) or a non-member spouse (decline, 4b).
- An existing person matched to the spouse goes through the registration consent machinery: the `registration_consents` table (person index 0, the spouse), the `/consent/[token]` screen, and `recordInPersonConsent`. Approval with that person is possible only when their consent is `given`.
- The member row, profile, Member ID and unactivated account come from a new `createMember()` in the registration module. Registration approval already writes these rows.
- While a request is open, the person is held: "Got married" and "Moved out" are refused, and "Passed away" closes the request and tells the family.

**Tech Stack:** SvelteKit 2, Svelte 5 runes, Drizzle, zod 4, `sveltekit-superforms`, svelte-sonner, Paraglide JS, Vitest (unit and integration), Playwright. No new dependency.

**Spec:** `docs/superpowers/specs/2026-10-27-membership-design.md`:

- decisions 3, 4, 5, 17, 18, 19, 21 and 22;
- the anti-goal "An existing member moved into another household without their own consent";
- the calls "Non-member records", "How consent works", "Newborns and other new members added by a family", "Got married, as a family" and "Member IDs are assigned at approval";
- the "Data changes" for `registrations` and `registration_consents`;
- flows 1–3, and "Depends on" (the outbox).

It builds on plans `2026-10-27-membership-2a-registration-backend.md`, `2026-11-05-membership-4a-passed-away-moved-out.md` and `2026-11-05-membership-4b-got-married.md`. `CLAUDE.md`, `DESIGN.md`, `src/routes/(admin)/DESIGN.md`, `src/routes/(member)/DESIGN.md` and `src/lib/components/DESIGN.md` are binding.

**Builds on:** commit `9b6fc67`, "children under 17 go with the last adult who leaves" (spec decision 22), which is inside `marry()`. Keep it when changing `marry()`'s signature. Approval and decline get it for free because they call `marry()`.

## User decisions (2026-11-05)

1. **Spouse form, family side: a short form, and staff complete it.** The family enters only the spouse's full name, nickname, sex and birth date. They may add an email or a phone for the spouse's own login, validated like registration contacts. The branch admin fills in the rest when approving: birth city, occupation, education, previous church, baptism and sidi, plus NIK and Chinese name if wanted. These are the remaining `personSchema` fields a member and their `member_profiles` row need. The address is the couple's new address, as the family gave it.
2. **Queue: the same Registrations queue.** The request shows there with a "Marriage" label. It shows the couple, the wedding date, the new address and the spouse's details, and it counts in the same nav badge. The admin can approve it (after completing the fields), send it back with a reason, or decline it.
3. **Send-back is fixed in My household.** The family adult is signed in. My household shows "Needs a fix" with the admin's reason and opens the same short form, pre-filled. Resubmitting returns the request to pending. The adult also gets a WhatsApp or email notice pointing to My household. There is no token link.
4. **Staff path: no queue.** When staff record a marriage to someone new who wants to be a member, the spouse is created as a member at once, with a Member ID, a profile, and an unactivated login if an email or phone is given. The staff "Got married" dialog gains this choice. The full member fields open on a separate staff page (see Decision D8).
5. **An existing person needs consent.** When the new spouse matches an existing person, the admin may not link them directly.
   - The admin chooses "This is the existing person". That sends the person a consent request by WhatsApp or email, through the registration consent machinery.
   - The request shows "waiting for consent" and cannot be approved until they answer.
   - On consent and approval, the marriage is recorded with that person and no new record is made. They move into the new household.
   - If they decline, the admin can only approve the spouse as a new person, or decline the request.
   - No path in this plan moves an existing person without their consent.
6. **One new template, `marriage_update`**, for WhatsApp and email. It covers approved, sent back and declined.
7. **When "Passed away" closes a waiting request, the family adult who submitted it is told**, through the outbox after commit.
8. **The staff member record** shows "Marriage waiting for approval", and "Waiting for consent" when that applies, for a person with an open request. It links to the request in the Registrations queue.
9. **Wider duplicate check.** The new spouse (same name and birth date) is matched against members, non-member records, and other open registrations and marriage requests. All matches are shown to the admin.

## Defaults (the user may change these)

10. **While a marriage waits for approval:**
    - "Got married" and "Moved out" are blocked for the person who is marrying. They are hidden, and the server refuses them, for family and staff alike.
    - My household shows "Marriage waiting for approval" on that person's row.
    - "Passed away" stays allowed. It closes the open request (status `declined`) in the same transaction.
11. **Decline:** the marriage is still a fact. The couple moves and the spouse is saved as a non-member record, exactly as in 4b. Only membership is refused, and the family adult is told. Decline is refused once a matched person has consented, because a duplicate record would follow; the admin approves with them or sends the request back.
12. **Notices:**
    - The adult who submitted is told on approve, send-back, decline and close.
    - On approval, a new spouse who gave an email or phone also gets the activation steps for their own login, through the existing `registration_approved` message.

## Decisions this plan makes

- **D1. Storage: extend `registrations`, not a new table.** The queue, the badge, `claim()`, the review scope, the consents, the audit entity and the outbox notices all key on `registrations`, so a separate table would duplicate each of them.
  - Added columns:
    - `kind` (`new_household`, the default, or `marriage`);
    - `subject_person_id`, the marrying person;
    - `submitted_by_person_id`.
  - `registration_link_id` becomes nullable.
  - The status enum gains `declined`.
  - The wedding date, address and short spouse form go in `payload`, validated by `marriageRequestSchema`.
- **D2. `subject_person_id`, not the spec's `target_household_id`.** A marriage makes a new household rather than adding to one. The subject's current household is read fresh under the lock at approval, so a stored copy could only go stale.
- **D3. One open request per person is a DB constraint.** The partial unique index `registrations_open_marriage_uniq` covers `subject_person_id` where `status in ('pending','needs_fix')`. It also serves the household and member-record lookups.
- **D4. Notices reuse `noticeTo(reg)`.** At submit and resubmit, `contact_email`, `contact_phone` and `locale` are copied from the submitter's own account, through a new `auth` service function `accountContact`. The existing `registrations_contact` check keeps holding.
- **D5. `marriage_update` (user decision 6) covers the outcomes `approved`, `needs_fix`, `declined` and `closed`.**
  - WhatsApp has one fixed text, with the parameters `subject`, `spouse` and `householdUrl`.
  - Email picks its body by `params.outcome`. The needs-fix email carries the reason, as `registration_needs_fix` does.
  - The consent request itself reuses the existing `consent_request` template, with `registrantName` set to the subject's full name.
- **D6. `marry(tx, couple, wedding, addSpouse?, metadata?)`.** The fourth parameter becomes a writer callback, `SpouseWriter`. It inserts the new person into the new household and returns its id and its `person.created` audit row. This way one move, lock and spouse-link path serves 4b, decline, approval and the staff path.
- **D7. Lock order: the registration row, then households, then people.** "Passed away" closes the request before it sets `deceased_on`, so a death racing an approval waits on the registration row instead of deadlocking. A consent answer already locks the registration row first (`lockRegistration`).
- **D8. Staff member fields go on a page: `/members/[id]/married`.** There are about 14 fields, including a city search and two conditional sacrament groups. In a 90dvh dialog they scroll badly and cannot show per-field superforms errors as the registration form does. The dialog keeps its two short choices and gains a third that links to the page.
- **D9. Who may submit, see and fix a request:** anyone `lifeChangeActor(subject)` allows (a family adult who is direct family, or a household adult for a child), plus staff. Notices go to whoever last submitted or resubmitted.
- **D10. Who may decide:** `reviewScope()` (`branch_admin`, `superadmin`) over `registrations.branch_id`, which is the subject's home branch at submit time.
- **D11. Consent for a marriage reuses `registration_consents`.**
  - The row has `personIndex = 0` (the spouse) and `requestedByStaff = true`. The existing unique index allows one live consent per request.
  - A person with an activated account gets a token link. Anyone else is "needs consent in person", and the admin records the answer with the existing `recordInPersonConsent`.
  - **Non-member records need consent too**, given in person. They have no login, and the anti-goal's reason (nobody is moved without agreeing) holds for them as much as for members.
  - After a decline, that request cannot ask anyone else (the one-per-request index). The admin approves as new or declines.
- **D12. The wider match is one query per source.**
  - People: members and non-members, by `lower(trim(full_name))` and `birth_date`. It uses the existing `people_name_birth_idx`.
  - Open registrations: `status in ('pending','needs_fix')`, in review scope, excluding this request. The query lateral-joins `jsonb_array_elements` over `payload->'people'`, or over the marriage `payload->'spouse'`.
  - Only people matches can be asked to consent. A registration match is shown as a warning with a link, because nobody exists yet to consent.
  - People outside the review scope collapse into `otherBranchMatch`, as today.

## Global Constraints

- **Layers:**
  - Each route calls one service function.
  - Only repositories touch `db` / `tx`.
  - The member module calls registration **services** (`marriage-store.ts`, `new-member.ts`, `decide.ts`), never registration repositories, and the reverse holds too.
  - `marriage-store.ts` and `new-member.ts` import nothing from `member/`, so no import cycle forms.
- **No query in a loop.** The household list and the member record get open requests with one `inArray` query.
- **The marriage rules are checked at submit, at resubmit, and again inside the deciding transaction**, for each spouse in the couple. These are 4b's rules:
  - alive;
  - `MARRIAGE_AGE` (19) or over on the wedding date;
  - no live spouse row;
  - the wedding is not after today in the subject's branch timezone.
- **Consent:** an existing person moves only when their consent row for this request reads `given` inside the approving transaction, read with `lockConsents`.
- **Errors are message keys.**
  - New keys: `error_marriage_waiting`, `error_nik_taken`, `error_consent_given`, `error_no_consent`.
  - Reused keys: `error_already_decided`, `error_waiting_for_consent`, `error_consent_exists`, `error_contact_taken`, `error_spouse_unavailable`, `error_same_person`, and 4b's keys.
- **Audit**, written by `recordAudit` / `recordAudits` inside the transaction. `diff` holds only the changed fields; a create stores `after` values only. A NIK appears only as `{ nik: { changed: true } }`.

  | Action                                                                                                                      | Entity                      | Diff                                                                                                                                                                                  | Metadata                                    |
  | --------------------------------------------------------------------------------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
  | `registration.submitted`                                                                                                    | registration                | `kind`, `subjectPersonId`, `weddingOn` (after)                                                                                                                                        | `actedAs` (family)                          |
  | `registration.resubmitted`                                                                                                  | registration                | `status` needs_fix → pending                                                                                                                                                          |                                             |
  | `registration.needs_fix`                                                                                                    | registration                | `status` pending → needs_fix, `fixReason` (after)                                                                                                                                     |                                             |
  | `registration.consent_requested`, `registration.consent_given` / `_declined`, `registration.consent_recorded` / `_declined` | registration                | as today, with `personIndex: 0`                                                                                                                                                       |                                             |
  | `registration.approved`                                                                                                     | registration                | `status` pending → approved, `householdId`, `spouseId` (after)                                                                                                                        |                                             |
  | `registration.declined`                                                                                                     | registration                | `status` pending → declined, `householdId` (after)                                                                                                                                    |                                             |
  | `registration.closed`                                                                                                       | registration                | `status` pending or needs_fix → declined                                                                                                                                              | `{ reason: 'passed_away' }`                 |
  | `person.married`                                                                                                            | person, per existing spouse | as in 4b                                                                                                                                                                              | `{ registrationId }` on approve and decline |
  | `person.created`                                                                                                            | person                      | member: `fullName`, `nickname`, `sex`, `birthDate`, `isMember: true`, `memberCode`, `householdId`, `addressLine`, `postalCode`, `cityId`, and `nik` when given. Non-member: as in 4b. |                                             |

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
4. **The matched person answers the consent link at the moment the admin approves as a new person.** There must be one outcome:
   - a new member is created and the consent answer gets `error_already_decided`; or
   - the consent is recorded and approval as new gets `error_consent_given`.

   An existing person is never moved without a `given` row. Test in Task 6.

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
| `src/lib/server/modules/registration/marriage-store.ts`, `marriage-store-repository.ts`       | insert, reopen, list open, close and notify, set household                                                   |
| `src/lib/server/modules/registration/marriage-decide.ts`, `marriage-notices.ts`               | `approveMarriage()`, `requestMarriageFix()`, `declineMarriage()`, notice building                            |
| `src/lib/server/modules/registration/marriage-consent.ts`, `marriage-match-repository.ts`     | `findSpouseMatches()`, `requestMarriageConsent()`, `approveMarriageToExisting()`                             |
| `src/lib/server/modules/registration/marriage-review.ts`                                      | the review view of a marriage request                                                                        |
| `src/lib/server/modules/registration/decide.ts`, `decide-repository.ts`                       | `claim()` filters by `kind`; `findMemberWithAccount` → `findPersonWithAccount`                               |
| `src/lib/server/modules/registration/consent.ts`, `fix-repository.ts`                         | the consent screen knows a marriage                                                                          |
| `src/lib/server/modules/registration/review-repository.ts`, `review-service.ts`               | queue rows and detail know `kind`                                                                            |
| `src/lib/server/modules/messaging/{sender,email,whatsapp}.ts`                                 | `marriage_update` template                                                                                   |
| `src/lib/server/modules/member/married.ts`                                                    | `SpouseWriter`, `nonMemberSpouse()`, `assertSpouseOldEnough()`, open-request check under the lock            |
| `src/lib/server/modules/member/married-member.ts`                                             | `recordMarriageToNewMember()` (staff)                                                                        |
| `src/lib/server/modules/member/marriage-request.ts`                                           | `submitMarriageRequest()`, `resubmitMarriageRequest()`, `getMarriageScreen()`                                |
| `src/lib/server/modules/member/{moved-out,passed-away,household-service,record-service}.ts`   | hold the person while a request is open; the record shows it                                                 |
| `src/lib/components/PersonFields.svelte`, `MarriageDialog.svelte`, `SpouseShortFields.svelte` | `hideRelation` prop, third choice, the family's short form                                                   |
| `src/routes/(admin)/registrations/…`                                                          | queue label, `MarriageReview.svelte`, actions; `FixDialog` gains `action` and `description` props            |
| `src/routes/(admin)/members/[id]/…`                                                           | waiting pill and link on the record; `married/` staff member-spouse page                                     |
| `src/routes/(member)/consent/[token]/+page.svelte`                                            | marriage wording                                                                                             |
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
  - Add the key `error_nik_taken` in all 4 locales.
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
    - `reopenMarriageRequest(tx, subjectPersonId: string, set: { payload; submittedByPersonId; locale; contactEmail; contactPhone }): Promise<{ id: string; branchId: string } | null>`. It sets `needs_fix → pending`, `fixReason: null` and `submittedAt: now`, guarded on `status = 'needs_fix'`. Consents are left as they are.
    - `openMarriageRequests(personIds: string[], tx?)` returns `Promise<Map<string, OpenRequest>>`, where:

      ```ts
      type OpenRequest = {
      	id: string;
      	status: 'pending' | 'needs_fix';
      	fixReason: string | null;
      	payload: MarriageRequestInput;
      	waitingConsent: boolean;
      };
      ```

      It is one query: `registrations` left-joined to live `registration_consents` with `decision = 'waiting'`.
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

### Task 4: A waiting marriage holds the person; a death closes it and tells the family

**Files:**

- Modify: `src/lib/server/modules/registration/marriage-store.ts`, `marriage-store-repository.ts`. Add `closeMarriageRequests` and `setRegistrationHousehold`; the second is used in Task 5.
- Create: `src/lib/server/modules/registration/marriage-notices.ts`
- Modify: `src/lib/server/modules/messaging/sender.ts`, `email.ts`, `whatsapp.ts`, `sender.test.ts`, `whatsapp.test.ts`
- Modify: `src/lib/server/modules/member/married.ts`, `moved-out.ts`, `passed-away.ts`, `household-service.ts`
- Modify: `married.int.test.ts`, `moved-out.int.test.ts`, `passed-away.int.test.ts`, `household.int.test.ts`
- Modify: `messages/*.json`

**Interfaces:**

- Produces:
  - `MessageTemplate` gains `'marriage_update'`.
    - WhatsApp `bodyParams`: `['subject', 'spouse', 'householdUrl']`.
    - Email picks its body by `params.outcome` (`approved`, `needs_fix`, `declined`, `closed`); the needs-fix body includes `params.reason`.
  - `marriageNotice(reg: { contactEmail; contactPhone; locale; payload }, subjectName: string, outcome: 'approved' | 'needs_fix' | 'declined' | 'closed', reason?: string): OutgoingMessage`.
    - It is built on `noticeTo(reg, 'marriage_update')`.
    - Params: `{ outcome, subject, spouse: payload.spouse.fullName, householdUrl: `${config.ORIGIN}/profile/household`, reason }`.
    - `reason` is `''` unless the outcome is `needs_fix` and the channel is email.
  - `closeMarriageRequests(tx, personId: string, subjectName: string): Promise<{ messageIds: string[] }>`.
    - It sets `status: 'declined'`, `decidedAt` and `decidedByPersonId` = the context person, for that person's open requests.
    - For each one it writes the `registration.closed` audit and enqueues `marriageNotice(…, 'closed')`.
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
  - `passed-away.int.test.ts`: `a death closes a waiting marriage request and tells the family`:
    - The status is `declined` and `decidedAt` is set.
    - `registration.closed` has diff `{ status: { before: 'pending', after: 'declined' } }` and metadata `{ reason: 'passed_away' }`.
    - No new person or household exists.
    - The outbox holds one `marriage_update` to `family@mail.test` with `params.outcome: 'closed'`.
  - `household.int.test.ts`: `a waiting marriage shows on the row and hides got married and moved out`:
    - A pending request → `marriageRequest: { status: 'pending', reason: null }`, `canMarry: false`, `canMoveOut: false`.
    - A needs-fix request → `reason: 'Wrong birth date'`.
  - `sender.test.ts` and `whatsapp.test.ts`: `marriage_update` builds body params `[subject, spouse, householdUrl]`. The email subject names the spouse, and the closed body names the subject.

- [ ] **Step 2: Run** `bun run test:int src/lib/server/modules/member` and `bun run test:unit -- --run src/lib/server/modules/messaging` → FAIL.

- [ ] **Step 3: Implement.**
  - In `recordPassedAway`, call `closeMarriageRequests` as the **first** statement of the transaction, before `setDeceasedOn`, and comment the lock order (D7). After commit, call `deliverAfterCommit(messageIds)`.
  - `getMyHousehold` adds `openMarriageRequests(ids)` to its existing `Promise.all`.
  - New keys:
    - `marriage_update_email_subject`
    - `marriage_approved_email_body`
    - `marriage_needs_fix_email_body`
    - `marriage_declined_email_body`
    - `marriage_closed_email_body`
    - `error_marriage_waiting`

    Each goes in all 4 locales.

- [ ] **Step 4: Run** → PASS.

- [ ] **Step 5: Commit** `feat(member): a waiting marriage holds the person`

---

### Task 5: The admin approves as a new person, sends back or declines

**Files:**

- Modify: `src/lib/server/modules/registration/decide.ts`, `decide-repository.ts`
- Create: `src/lib/server/modules/registration/marriage-decide.ts`, `marriage-decide.int.test.ts`
- Modify: `messages/*.json`

**Interfaces:**

- Consumes: Tasks 2–4; `claim`, `decided`, `deliverAfterCommit`, `lockConsents`, `reviewScope`; member `subjectOf`, `assertMayMarry`, `assertSpouseOldEnough`, `marry`, `nonMemberSpouse`, `toAddress`.
- Produces:
  - `claim(tx, id, set, kind: 'new_household' | 'marriage' = 'new_household')`. `claimPending` adds `eq(registrations.kind, kind)`. `findInScope` returns `kind`, and a different kind throws `NotFoundError`.
  - `parseReason(input: string): string`. This is the existing `reasonSchema` parse, exported.
  - In `marriage-decide.ts`:
    - `approveMarriage(id: string, input: unknown): Promise<{ householdId: string; spouseId: string }>`.
      - The input is `MemberSpouse`. A parse failure throws `ValidationError('error_invalid_registration', issues)`.
      - A consent row that is `waiting` throws `error_waiting_for_consent`; one that is `given` throws `error_consent_given`. A `declined` row allows the approval.
    - `requestMarriageFix(id: string, reason: string): Promise<void>`
    - `declineMarriage(id: string): Promise<{ householdId: string; spouseId: string }>`. A `given` consent throws `error_consent_given`.
  - `decideIn(tx, id, set)` is a shared helper: `claim(…, 'marriage')`, `lockConsents`, `subjectOf`, `assertMayMarry`.

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
  - `send back`: `requestMarriageFix(id, 'Wrong birth date')`:
    - `status: 'needs_fix'`, `fixReason` stored, and `fixTokenHash` null.
    - `marriage_update` is sent with `outcome: 'needs_fix'`. `reason` is `'Wrong birth date'` by email, and `''` when the request has only a phone.
    - One `registration.needs_fix` row exists.
  - `decline records the marriage with a non-member spouse`:
    - `status: 'declined'`.
    - The spouse has `isMember: false`, no profile and no account.
    - The couple has moved.
    - `registration.declined` has diff `{ status: { before: 'pending', after: 'declined' }, householdId: { after } }`.
    - `marriage_update` is sent with `outcome: 'declined'`.
  - `consent blocks approval as new`:
    - A `registration_consents` row (index 0) that is `waiting` → `approveMarriage` fails with `error_waiting_for_consent`.
    - One that is `given` → `approveMarriage` and `declineMarriage` fail with `error_consent_given`.
    - One that is `declined` → `approveMarriage` succeeds.
  - `an admin of another branch can neither see nor decide it` (D10): `approveMarriage` → `NotFoundError`, and `listRegistrations` for that admin does not include the id.
  - `household actions refuse a marriage request`:
    - `approveRegistration`, `requestFix` and `markSpam` on the marriage id → `NotFoundError`, and the status stays `pending`.
    - `approveMarriage` on a household registration → `NotFoundError`.

- [ ] **Step 2: Run** `bun run test:int src/lib/server/modules/registration/marriage-decide` → FAIL.

- [ ] **Step 3: Implement.**
  - Each decision follows the same steps:
    1. `decideIn`. The claim comes first, so a lost race fails before any write, and consents are read under lock after it.
    2. The consent rule.
    3. The spouse age check, which approve runs on the admin's birth date.
    4. `marry(tx, …, writer, { registrationId })`.
    5. `setRegistrationHousehold`.
    6. Audit.
    7. Enqueue through `marriageNotice` and `activationNotice`.
    8. `deliverAfterCommit` after the commit.
  - Approve uses the address in `input.address`; decline uses `payload.address`.
  - New key: `error_consent_given`, in all 4 locales.

- [ ] **Step 4: Run** the command above, plus `bun run test:int src/lib/server/modules/registration` → PASS.

- [ ] **Step 5: Commit** `feat(registration): approve, send back or decline a marriage request`

---

### Task 6: Matches, consent from an existing person, and approval with them

**Files:**

- Create: `src/lib/server/modules/registration/marriage-match-repository.ts`, `marriage-consent.ts`, `marriage-consent.int.test.ts`
- Modify: `src/lib/server/modules/registration/decide-repository.ts`. `findMemberWithAccount` becomes `findPersonWithAccount`, without the `is_member` filter; its one caller, `sendConsentRequest`, only passes members from `findSameNameAndBirth`.
- Modify: `src/lib/server/modules/registration/consent.ts`, `fix-repository.ts` (`findWaitingConsent` also returns `kind` and the subject's full name), `consent.int.test.ts`
- Modify: `src/routes/(member)/consent/[token]/+page.svelte`, `messages/*.json`

**Interfaces:**

- Consumes: Task 5 `decideIn`, `marriageNotice`; the existing `insertConsent`, `consentMessage`, `lockConsents`, `findInScope`, `recordInPersonConsent`, `decideConsent`; member `subjectOf`, `marriageRefusal`, `marry`.
- Produces:
  - `findPeopleByNameAndBirth(c: { fullName: string; birthDate: string })`. It returns `{ id, fullName, memberCode: string | null, isMember: boolean, homeBranchId }[]`, alive or not, not deleted.
  - `findOpenRegistrationsByNameAndBirth(c, excludeId: string, scope: BranchScope)`. It returns `{ id, kind, submittedAt }[]`, using the lateral `jsonb_array_elements` join of D12.
  - `findSpouseMatches(registrationId: string, spouse: { fullName; birthDate })`:

    ```ts
    Promise<{
    	people: { personId; fullName; memberCode: string | null; isMember: boolean }[];
    	registrations: { id; kind; submittedAt }[];
    	otherBranchMatch: boolean;
    }>;
    ```

    People outside `reviewScope()` collapse into `otherBranchMatch`.

  - `requestMarriageConsent(id: string, personId: string): Promise<void>`.
    - It accepts only `personId` among `findSpouseMatches(…).people`; anything else throws `error_spouse_unavailable`, and the subject throws `error_same_person`.
    - It inserts a consent with `personIndex: 0` and `requestedByStaff: true`. The token is set only for an activated account (`findPersonWithAccount`).
    - `insertConsent` returning false throws `error_consent_exists`.
    - It audits `registration.consent_requested` and, with a token, enqueues `consentMessage(person, subject.fullName, token)`.
  - `approveMarriageToExisting(id: string): Promise<{ householdId: string }>`.
    - It runs `decideIn`.
    - It requires the index-0 consent to be `given`; anything else (no row, `waiting`, `declined`) throws `error_no_consent`.
    - It runs `subjectOf(matchedPersonId)`, then `marriageRefusal(existing, weddingOn)`.
    - It then calls `marry(tx, [subject, existing], wedding, undefined, { registrationId })`, `setRegistrationHousehold`, audits `registration.approved` with `spouseId`, and sends `marriageNotice(…, 'approved')`.
  - `loadConsent` returns `{ kind, registrantName, subjectName, branchName }`.

- [ ] **Step 1: Write the failing tests** in `marriage-consent.int.test.ts`. The fixture is Task 5's, plus `rani`: a member `'Rani Putri'` born `'1999-02-02'` in the same branch, in her own household, with an activated account `rani@mail.test`.
  - `matches cover members, non-members and open registrations`. Add a non-member `'rani putri '` with the same birth date, and an open household registration whose person 2 is `'Rani Putri'`, `'1999-02-02'`:
    - `people` holds both, with `isMember` `true` and `false`.
    - `registrations` holds the other request's id, and never this one.
    - A match in another branch only sets `otherBranchMatch: true`.
  - `asking an activated member sends a consent link`:
    - 1 consent row with `personIndex: 0`, `decision: 'waiting'` and `tokenHash` set.
    - The outbox holds `consent_request` to `rani@mail.test` with `params.registrantName` = the subject's name.
    - One `registration.consent_requested` row exists.
  - `a non-member record needs consent in person`:
    - The consent row has `tokenHash: null` and no message is sent.
    - `recordInPersonConsent(id, 0)` → `given`.
  - `a second ask on the same request is refused` → `error_consent_exists`.
  - `someone who is not a match cannot be asked` → `error_spouse_unavailable`.
  - `approval with the existing person needs their consent`:
    - With no consent, or with `waiting` or `declined` → `error_no_consent`, and Rani's `householdId` is unchanged.
    - After `decideConsent(token, 'given')` as Rani:
      - `approveMarriageToExisting` moves the subject and Rani into one new household;
      - no new `people` row exists;
      - the status is `approved`;
      - there is 1 spouse link;
      - no `registration_approved` message is sent.
  - `the consent answer and an approval as new at once: one outcome` (Review Focus 4): `Promise.allSettled([asPerson(rani, decideConsent(token, 'given')), asAdmin(approveMarriage(id, complete))])`. Exactly one is fulfilled.
    - If the approval won: 1 new member exists, and the consent stays `waiting`.
    - If the consent won: the request stays `pending` and no new person exists.
  - `the consent screen speaks of the marriage`: `loadConsent(token)` as Rani → `{ kind: 'marriage', subjectName: <subject> }`.
  - `consent.int.test.ts` (existing) stays green, with `kind: 'new_household'` added to its expectation.

- [ ] **Step 2: Run** `bun run test:int src/lib/server/modules/registration/marriage-consent src/lib/server/modules/registration/consent` → FAIL.

- [ ] **Step 3: Implement.**
  - The registration-match query carries `// shortcut: scans open registrations' JSON; add a name/birth index if the open queue grows past a few thousand`.
  - The consent screen shows `consent_marriage_title` and `consent_marriage_body` when `kind === 'marriage'`, for example: "{subject}'s family recorded that {subject} married you. If this is you, the church will record the marriage and move you into the couple's new household at {branch}."
  - New keys: `consent_marriage_title`, `consent_marriage_body`, `error_no_consent`. Each goes in all 4 locales.

- [ ] **Step 4: Run** → PASS.

- [ ] **Step 5: Commit** `feat(registration): an existing person consents before a marriage links them`

---

### Task 7: Admin screens: queue label, review screen, member record pill

**Files:**

- Modify: `src/lib/server/modules/registration/review-repository.ts`, `review-service.ts`, `review.int.test.ts`
- Create: `src/lib/server/modules/registration/marriage-review.ts`
- Modify: `src/lib/server/modules/member/record-service.ts`, `record.int.test.ts`
- Modify: `src/routes/(admin)/registrations/+page.svelte`, `[id]/+page.server.ts`, `[id]/+page.svelte`, `[id]/FixDialog.svelte`
- Create: `src/routes/(admin)/registrations/[id]/MarriageReview.svelte`
- Modify: `src/routes/(admin)/members/[id]/+page.svelte`
- Modify: `src/lib/components/PersonFields.svelte` (`hideRelation` prop), `components.svelte.test.ts`
- Modify: `e2e-db.ts` (`e2eMarriageRequest`)
- Create: `src/routes/(admin)/registrations/marriage.e2e.ts`
- Modify: `messages/*.json`

**Interfaces:**

- Produces:
  - `listQueue` and `listRegistrations` items gain `kind` and `subjectName: string | null`, taken from a left join of `people` on `subject_person_id`.
    - `registrantName` = `coalesce(payload->'people'->0->>'fullName', payload->'spouse'->>'fullName')`.
    - `peopleCount` = `coalesce(jsonb_array_length(payload->'people'), 1)`.
    - The existing `waitingConsents` count already covers marriages.
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
      matches: Awaited<ReturnType<typeof findSpouseMatches>>;
      consent: { personId; fullName; decision: Consent } | null;
      draft: Partial<MemberSpouse>; // payload spouse + address, for the form
    }
    ```

  - `getMember().changes` gains `marriageRequest: { id: string; status: 'pending' | 'needs_fix'; waitingConsent: boolean } | null`. It comes from `openMarriageRequests([id])` and is set for any staff viewer.
  - `PersonFields` gets the prop `hideRelation?: boolean`, default `false`.
  - `FixDialog` gets the props `action = '?/fix'` and `description = m.registration_fix_body()`.
  - Page actions:
    - `approveMarriage`: `superValidate(request, zod4(memberSpouseSchema))`; an invalid form returns `fail(400, { form })`; then `approveMarriage`.
    - `approveExisting`.
    - `askConsent`: the field `personId`.
    - `fixMarriage`: the field `reason`.
    - `decline`.

    The existing `consentInPerson` and `consentDeclinedInPerson` actions work as they are, with `personIndex: 0`.

- [ ] **Step 1: Write the failing tests:**
  - `review.int.test.ts`:
    - `the queue lists a marriage with its kind and both names` → `{ kind: 'marriage', subjectName: <subject>, registrantName: 'Rani Putri', peopleCount: 1 }`.
    - `a marriage review shows the couple, the date, the address, the matches and the consent`:
      - `kind: 'marriage'` and `weddingOn: '2026-06-01'`;
      - `address.city` is the city's name;
      - `matches.people[0].memberCode` is the same-name member's code;
      - after `requestMarriageConsent`, `consent.decision` is `'waiting'`;
      - the JSON holds no `nik`.
  - `record.int.test.ts`: `the record shows a waiting marriage` → `changes.marriageRequest` equals `{ id, status: 'pending', waitingConsent: false }`. After a consent request, `waitingConsent` is `true`. A pastor sees it too.
  - `components.svelte.test.ts`: `PersonFields with hideRelation shows no relation select`.
  - `marriage.e2e.ts` uses `e2eMarriageRequest()`, which builds `e2eFamily()` plus a pending marriage request for the child, submitted by the adult, in JKT.
    - `an admin completes and approves a marriage request`:
      1. `/registrations` shows the row "{child} & Rani …" with a "Marriage" pill.
      2. Open it. The heading names both, and the meta line shows the wedding date.
      3. Fill the birth city, the occupation and the education, tick "No previous church", and answer baptized No and sidi No.
      4. Press Approve → the toast "Approved" shows.
      5. The member list, searched for "Rani", shows a Member ID.
    - `an admin asks an existing member to consent`. Seed with the spouse named like an existing JKT member `e2eSingle()` and the same birth date:
      1. The match shows. Press "This is the existing person" → the toast "Consent request sent".
      2. The row shows "Waiting for consent" and Approve is disabled.
      3. On the child's member record, "Marriage waiting for approval" and "Waiting for consent" show, with a link that opens the request.
    - `an admin sends a marriage back and declines another`:
      1. Send one back with a reason → it is listed under the "Needs a fix" tab.
      2. Decline a second through the confirm dialog → the toast "Declined" shows.

- [ ] **Step 2: Run** `bun run test:int src/lib/server/modules/registration/review src/lib/server/modules/member/record`, `bun run test:unit -- --run src/lib/components` and `npx playwright test src/routes/(admin)/registrations/marriage.e2e.ts` → FAIL.

- [ ] **Step 3: Implement.**
  - `+page.svelte` renders `MarriageReview` when `reg.kind === 'marriage'`, and the current view otherwise.
  - `MarriageReview` holds:
    - **Header card.** The title is "{subject} & {spouse}". The meta line reads "Marriage · wedding {date} · submitted … · branch".
    - **Detail card.** The new address, the submitter, and the spouse's email or phone.
    - **Matches.**
      - People get a "member" or "not a member" pill. Each has an outlined "This is the existing person" button (`?/askConsent`) while no consent exists.
      - Registration matches are warnings linking to `/registrations/{id}`.
    - **Consent.** When a consent exists, the matched person and the existing `StatusPill` show. While it is in-person, the existing "Recorded in person" and "Declined in person" buttons show.
    - **Main action, by consent state:**
      - `given`: a filled "Approve the marriage with {name}" (`?/approveExisting`) replaces the form.
      - `waiting`: the form's Approve is disabled, with `registration_approve_blocked`.
      - none or `declined`: the completion form is `PersonFields` with `hideRelation`, using the superforms `dataType: 'json'` pattern of `RegistrationForm`, plus a filled "Approve".
    - **Send back.** `FixDialog` with `action="?/fixMarriage"` and the marriage description.
    - **Decline.** A `ConfirmDialog` that names the spouse and says they will be saved as not a member. It is hidden when the consent is `given`.
  - Member record header: when `changes.marriageRequest` is set, show `StatusPill tone="warning"` "Marriage waiting for approval", plus "Waiting for consent" when `waitingConsent` is true. Branch and super admins also get a link "Open the request" to `/registrations/{id}`; it shows when `changes.canChange`, because the queue is closed to pastors.
  - New keys:
    - `registrations_kind_marriage`
    - `registration_marriage_title`
    - `registration_marriage_meta`
    - `registration_marriage_existing`
    - `registration_marriage_approve_existing`
    - `registration_marriage_fix_body`
    - `registration_match_not_member`
    - `registration_match_open_registration`
    - `registration_decline`
    - `registration_decline_title`
    - `registration_decline_body`
    - `registration_declined`
    - `registration_submitted_by`
    - `member_marriage_waiting`
    - `member_marriage_open_request`

    Each goes in all 4 locales.

- [ ] **Step 4: Run** → PASS. Run `bun run check` → clean.

- [ ] **Step 5: Commit** `feat(registration): review marriage requests in the registrations queue`

---

### Task 8: Staff "Someone new who wants to be a member"

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

### Task 9: Family screens: the choice, waiting, needs a fix, resubmit

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

## Open questions for the user

1. **4b's staff "marry two existing members"** (`recordMarriageToMember`) still moves the other person into the new household without their consent. That conflicts with the anti-goal this plan now enforces for 4c. This plan leaves 4b unchanged.
   - **Recommendation:** in a follow-up, give 4b's staff path the same rule: recording the marriage needs the other person's consent, through a link or recorded in person by the admin.
2. **WhatsApp wording for a closed request.** The `closed` outcome reuses the one approved `marriage_update` WhatsApp text, which points to My household. My household then shows nothing for the deceased person; the email explains the closure.
   - **Recommendation:** accept, rather than ask Meta for a sixth template.
3. **A consent answer while a request is sent back.** As for household registrations today, a consent answered while the request is "Needs a fix" is refused (`error_already_decided`). The member must answer after the family resubmits.
   - **Recommendation:** accept; it matches today's behaviour.
4. **One consent per request.** After a matched person declines, the admin cannot ask a second match on the same request (the existing one-per-person-index rule). They approve as new, or decline.
   - **Recommendation:** accept.

## Not in this plan

- Newborns or other additions to an existing household (the spec's `household_addition`).
- Changing 4b's staff marriage of two existing people (Open question 1).
- Undoing an approval or a decline, and divorce.
