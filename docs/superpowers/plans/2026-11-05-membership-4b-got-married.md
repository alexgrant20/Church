# Membership 4b: Got Married — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A marriage can be recorded, moving the couple into a new household of their own with a spouse link and the wedding date. A household adult or a branch admin can record a marriage to a new spouse who is not a member. A branch admin can also marry two people already on record.

**Architecture:** One service file, `member/married.ts`, built on the plan 4a pieces: `lifeChangeActor`, `isAdult`, `findSubject`, the locked household move, and `recordAudit`. Each marriage is one transaction:

1. Lock the households the couple leaves.
2. Insert the new household.
3. Insert the new spouse, if there is one.
4. Move the couple, using the guarded `moveTo`.
5. Write the spouse row.
6. Soft-delete any household left with no living person.
7. Audit.

Staff record a marriage from a dialog on the member record. Families record one from a two-step screen under My household.

**Tech Stack:** SvelteKit 2, Svelte 5 runes, Drizzle, zod 4, Paraglide JS, Vitest (unit and integration), Playwright. No new dependency.

**Spec:** `docs/superpowers/specs/2026-10-27-membership-design.md`: decisions 17 and 18, call "Got married, as a family", data change "audit action `person.married`". `CLAUDE.md`, `DESIGN.md`, `src/routes/(admin)/DESIGN.md`, `src/routes/(member)/DESIGN.md` and `src/lib/components/DESIGN.md` are binding.

**User decisions for this plan (2026-11-05):**

- A new spouse who **wants to be a member** goes through the approval queue in **plan 4c**, not here. In 4b a newly added spouse is always saved straight away as a non-member record (decision 18, "Does not").
- The minimum age to be recorded as married is **19**, the Indonesian legal marriage age. It applies to both spouses, whoever records it.
- A new non-member spouse is entered with a **short form**: full name, nickname, sex and birth date. Their address is the couple's new address. No profile fields.

**Not in this plan:**

- the "wants to be a member" choice and the approval queue (4c);
- undoing a marriage (the spec lists undo only for "Passed away" and "Moved out");
- divorce;
- adding a newborn;
- children moving with a remarrying parent (the spec moves "the couple" only).

## Global Constraints

- **Who may record:**
  - **New non-member spouse:** a family adult of the subject's household, or staff (`branch_admin`, `superadmin`) for the subject's home branch. This is `lifeChangeActor(subject)` from plan 4a.
  - **Two existing people:** staff only, and both people's home branches must be in scope. The spec says "Marrying someone who already belongs to another household is staff-only".
  - Anyone else gets `NotFoundError`.
- **Who may marry:** each spouse must be:
  - alive;
  - 19 or over on the wedding date, by the subject's home-branch timezone: `ageOn(birthDate, weddingOn) >= MARRIAGE_AGE`, where `MARRIAGE_AGE = 19` is a constant in `married.ts`;
  - without a live spouse row (`kind = 'spouse'`, `ended_on is null`, `deleted_at is null`).

  The two people must be different and must not already have a live spouse row between them.

- **Wedding date:**
  - Required.
  - Not after today in the subject's home-branch timezone.
  - Not before either spouse's birth date plus 19 years; this is the age rule above.
  - The schema's coarse future guard is the 4a one (up to tomorrow UTC); the service makes the exact check.
- **Result, in one transaction:**
  - Insert a new household.
  - Move only the couple into it, with the submitted address. Their relationship rows stay.
  - Insert one spouse row with `person_id` < `related_person_id` (the existing check) and `started_on = weddingOn`.
  - Soft-delete each household the couple left that now has no living person in it.
  - Children do not move.
- **New non-member spouse row:** `is_member = false`, `member_code = null`, `home_branch_id` = the subject's home branch, the new household, the submitted address. No `member_profiles` row, and no account.
- **Concurrency:** lock each household being left (`lockHousehold`) in id order, so two marriages cannot deadlock. Move with the guarded `moveTo(tx, id, from, to, address)`. A lost race throws `error_already_married`, so two simultaneous marriages of one person give one success.
- **Audit**, written inside the transaction, with entity `person` and the branch of that person's home branch:
  - One `person.married` row per existing spouse. Its diff holds `householdId` before/after, any address fields that changed, `spouseId: { after }` and `weddingOn: { after }`.
  - For a new spouse, one `person.created` row with only `after` values: `fullName`, `nickname`, `sex`, `birthDate`, `isMember: false`, `householdId`.
- **Errors** are message keys: `error_not_marriage_age`, `error_already_married`, `error_already_deceased`, `error_same_person`, `error_wedding_in_future`, and the existing `error_required` / `error_invalid_date`.
- Layers: route → one service function → repository. Only repositories touch `db` / `tx`. No query inside a loop.
- Member screens: phone-first, 18px body, 48px targets, a 56px full-width main action, a long form split into steps with "Step 1 of 2" in words, and the known address pre-filled.
- All copy comes from Paraglide in 4 locales. Functions under ~40 lines, files under ~200 lines. Comments say why.

## Review Focus

1. Recording the same marriage twice at once (a double tap, or two family adults) creates one spouse, one household and one spouse row, never two. Test in Task 2.
2. A person turning 19 on the wedding date is allowed; the day before is refused. The age is judged on the wedding date, not today. Test in Task 2.
3. Marrying someone whose household empties as a result, for example a widow living alone, soft-deletes that household. A household that still has a child in it stays live. Test in Task 3.
4. A staff member whose scope covers only one of the two existing people must get `NotFoundError`, so the response does not reveal whether the other person exists. Test in Task 3.
5. A person with an _ended_ marriage (`ended_on` set) may marry again; one with a live marriage may not. Test in Task 2.

---

## File Map

| File                                                              | Responsibility                                                                |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `src/lib/life-change/schema.ts`                                   | add `marriedNewSchema`, `marriedExistingSchema`                               |
| `src/lib/server/modules/member/life-change-repository.ts`         | `hasLiveSpouse()`, `spousesBetween()`, `insertPerson()`, `insertSpouseLink()` |
| `src/lib/server/modules/member/married.ts`                        | `recordMarriage()`, `recordMarriageToMember()`, `canMarry()`, `MARRIAGE_AGE`  |
| `src/lib/server/modules/member/record-service.ts`                 | `changes.canMarry`                                                            |
| `src/lib/server/modules/member/household-service.ts`              | `HouseholdPerson.canMarry`                                                    |
| `src/lib/server/modules/member/repository.ts`                     | member list rows gain `name` (= full name) for `SearchSelect`                 |
| `src/lib/components/MarriageDialog.svelte`, `MemberSelect.svelte` | staff dialog                                                                  |
| `src/routes/(admin)/members/[id]/+page.server.ts`, `+page.svelte` | `?/married`, `?/marriedMember` actions, header action                         |
| `src/routes/(member)/profile/household/[id]/married/…`            | family two-step screen                                                        |
| `messages/*.json`                                                 | new keys                                                                      |

---

### Task 1: Schemas and repository pieces

**Files:**

- Modify: `src/lib/life-change/schema.ts`, `src/lib/life-change/schema.test.ts`
- Modify: `src/lib/server/modules/member/life-change-repository.ts`
- Create: `src/lib/server/modules/member/marriage-repository.int.test.ts`

**Interfaces:**

- Produces:
  - `marriedNewSchema = z.object({ weddingOn, spouse: z.object({ fullName, nickname, sex, birthDate }), address: addressSchema })`. `weddingOn` uses the same coarse guard as `passedAwaySchema`. The spouse fields reuse `personSchema.shape.fullName`, `.nickname`, `.sex` and `.birthDate`, so their messages match registration.
  - `marriedExistingSchema = z.object({ weddingOn, spouseId: z.uuid('error_required'), address: addressSchema })`
  - Repository:
    - `hasLiveSpouse(personId: string, tx?): Promise<boolean>`
    - `insertPerson(tx, row: { fullName; nickname; sex; birthDate; homeBranchId; householdId; addressLine; postalCode; cityId }): Promise<string>`. It inserts with `isMember: false` and `memberCode: null`.
    - `insertSpouseLink(tx, a: string, b: string, startedOn: string)`. It orders the two ids before inserting.

- [ ] **Step 1: Write the failing tests:**
  - `schema.test.ts`:
    - `marriedNewSchema` requires the spouse's full name (`error_required`).
    - It rejects a wedding date 2 days ahead (`error_date_in_future`).
    - `marriedExistingSchema` requires `spouseId`.
  - `marriage-repository.int.test.ts`:
    - `hasLiveSpouse` is true for a live spouse row, false for an ended one, and false for a soft-deleted one.
    - `insertSpouseLink` stores the row with ordered ids whichever order it gets them in, and with `startedOn`.
    - `insertPerson` stores a non-member with a null Member ID.

- [ ] **Step 2: Run** `bun run test:unit -- --run src/lib/life-change` and `bun run test:int src/lib/server/modules/member/marriage-repository` → FAIL.

- [ ] **Step 3: Implement** the schemas and the three repository functions.

- [ ] **Step 4: Run** → PASS.

- [ ] **Step 5: Commit** `feat(member): marriage schemas and spouse-link queries`

---

### Task 2: Marriage to a new non-member spouse

**Files:**

- Create: `src/lib/server/modules/member/married.ts`, `married.int.test.ts`

**Interfaces:**

- Consumes: Task 1, plus plan 4a's `subjectOf`, `lifeChangeActor`, `lockHousehold`, `moveTo`, `livePeopleIn` and `softDeleteHousehold`.
- Produces:
  - `MARRIAGE_AGE = 19`
  - `recordMarriage(personId: string, input: unknown): Promise<{ householdId: string; spouseId: string }>`
  - `marriageRefusal(subject: Subject, weddingOn: string): Promise<string | null>`. It returns the first failing rule's error key, or null.
  - `canMarry(personId: string): Promise<boolean>`. It is true when `marriageRefusal(subject, todayIn(subject.timezone))` is null.

- [ ] **Step 1: Write the failing tests:**
  - `a household adult records a marriage to a new non-member`. As the subject's parent in `runWithContext`:
    - The subject and the new spouse share a new household.
    - The spouse has `isMember: false`, `memberCode: null`, no `member_profiles` row and no account.
    - One spouse row has `startedOn` = the wedding date.
    - The parent stays in the old household.
    - One `person.married` row for the subject, with `spouseId` and `weddingOn` in the diff, and its `actorPersonId` is the parent.
    - One `person.created` row for the spouse, with after values only.
  - `staff records the same`: as a branch admin of the home branch → the same result.
  - `the age is judged on the wedding date`:
    - Subject born `2007-06-01`, wedding `2026-06-01` → allowed.
    - A second subject born `2007-06-02`, wedding `2026-06-01` → `error_not_marriage_age`.
  - `a new spouse under 19 is refused` → `error_not_marriage_age`.
  - `someone already married is refused`: a live spouse row → `error_already_married`. With `endedOn` set on that row instead → allowed.
  - `a deceased subject is refused` → `error_already_deceased`.
  - `a wedding after today in the branch calendar is refused`: fake timers at `2026-10-01T18:00:00Z`:
    - `2026-10-03` → `error_wedding_in_future`.
    - `2026-10-02` → allowed.
  - `a lone subject's old household is soft-deleted`: the subject lives alone and marries → the old household has `deletedAt` set.
  - `recording the same marriage twice at once makes one marriage`: two calls through `Promise.allSettled`:
    - One is fulfilled, the other rejected with `error_already_married`.
    - Exactly 1 non-member spouse row exists for that full name, and 1 spouse link.
  - `a stranger gets NotFoundError`.

- [ ] **Step 2: Run** `bun run test:int src/lib/server/modules/member/married` → FAIL.

- [ ] **Step 3: Implement.**
  - The rule order in `marriageRefusal`:
    1. Deceased.
    2. Age on the wedding date.
    3. Live spouse.
  - `recordMarriage`:
    1. Actor.
    2. Parse.
    3. Check the wedding date against the branch day.
    4. `marriageRefusal` for the subject.
    5. The age check for the new spouse's birth date.
    6. One transaction:
       1. `lockHousehold(from)`.
       2. Re-check `hasLiveSpouse(subject, tx)`; this re-check under the lock is what makes a double submit lose.
       3. `insertHousehold`.
       4. `insertPerson`.
       5. `moveTo`; when it returns false, throw `error_already_married`.
       6. `insertSpouseLink`.
       7. Soft-delete `from` if `livePeopleIn(from, tx) === 0`.
       8. `recordAudits` for both rows.
  - Keep each function under ~40 lines. A small `marry(tx, …)` helper that moves the couple and writes the link is shared with Task 3.

- [ ] **Step 4: Run** → PASS.

- [ ] **Step 5: Commit** `feat(member): record a marriage to a new non-member spouse`

---

### Task 3: Staff marry two existing people

**Files:**

- Modify: `src/lib/server/modules/member/married.ts`, `married.int.test.ts`

**Interfaces:**

- Produces: `recordMarriageToMember(personId: string, input: unknown): Promise<{ householdId: string }>`

- [ ] **Step 1: Write the failing tests:**
  - `staff marries two people from different households`:
    - Both are in one new household with the submitted address.
    - One spouse row exists.
    - Two `person.married` audit rows, each naming the other in `spouseId`.
  - `a household left with a child stays live; one left empty is closed`:
    - The groom leaves his parents' household, which keeps the parents, so it stays live.
    - The bride lived alone, so her household is soft-deleted.
  - `the same person twice is refused` → `error_same_person`.
  - `the other person must be marriage age, alive and unmarried`: the same three error keys as Task 2.
  - `staff whose scope covers only one of them gets NotFoundError`: the bride's home branch is another branch.
  - `a family adult cannot use it` → `NotFoundError`.

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement.**
  - Call `staffOnly` on both subjects (looked up with `subjectOf`).
  - Lock both households in ascending id order. When the two are in the same household, lock it once and move both.
  - Re-check `hasLiveSpouse` for both under the lock.
  - Each `moveTo` that returns false throws `error_already_married`.

- [ ] **Step 4: Run** → PASS.

- [ ] **Step 5: Commit** `feat(member): staff marry two people already on record`

---

### Task 4: Staff "Got married" dialog

**Files:**

- Modify: `src/lib/server/modules/member/record-service.ts` (`changes.canMarry = canChange && await canMarry(id)`), `record.int.test.ts`
- Modify: `src/lib/server/modules/member/repository.ts`. Member list rows gain `name: people.fullName`, so `SearchSelect` can show and remember the choice.
- Create: `src/lib/components/MemberSelect.svelte`. It wraps `SearchSelect` with endpoint `/api/members`; each option shows the name and the Member ID.
- Create: `src/lib/components/MarriageDialog.svelte`. It has two radio choices: "Someone new" and "Already a member".
  - Someone new: the short spouse fields and the wedding date.
  - Already a member: `MemberSelect` and the wedding date.
  - Both: `AddressFields` pre-filled with the subject's address, and a submit button "Record the marriage".
  - It posts to `?/married` or `?/marriedMember` through the shared decider, like `LifeChangeDialogs`.
- Modify: `src/routes/(admin)/members/[id]/+page.server.ts` (two actions with `runAction`), `+page.svelte` (shows the dialog when `changes.canMarry`)
- Modify: `src/routes/(admin)/members/life-change.e2e.ts`, `e2e-db.ts`. `e2eFamily()` also returns a single adult, `e2eSingle()`, in another household of JKT.
- Modify: `messages/*.json`

- [ ] **Step 1: Write the failing tests:**
  - `record.int.test.ts`: `changes.canMarry` is true for an unmarried adult, false for Budi (married to Sari in the fixture), and false for a pastor.
  - `life-change.e2e.ts`:
    - `an admin records a marriage to someone new`:
      1. On the family's child (25 after the `e2eFamily` change below), press "Got married".
      2. Fill the spouse's name, sex and birth date, and the wedding date.
      3. Submit → the toast "Saved" shows.
      4. The Family tab lists the new spouse marked "not a member", under "This household".
    - `an admin marries two members`:
      1. Press "Got married", choose "Already a member", search for and pick the `e2eSingle` person, set the date, and submit.
      2. The Family tab lists them as spouse.
  - Update `e2eFamily` so the child is 25 rather than 20. Fix any test that relied on 20.

- [ ] **Step 2: Run** the int and e2e tests → FAIL.

- [ ] **Step 3: Implement.** New keys:
  - `member_married`, `member_married_title`, `member_married_new`, `member_married_existing`, `member_married_wedding_on`, `member_married_spouse`, `member_married_submit`
  - `field_full_name` and `field_nickname`, which probably exist already; reuse them
  - the 5 new `error_*` keys

  Each goes in all 4 locales.

- [ ] **Step 4: Run** → PASS. Run `bun run check` → clean.

- [ ] **Step 5: Commit** `feat(member): staff record a marriage from the member record`

---

### Task 5: Family "Got married" screen

**Files:**

- Modify: `src/lib/server/modules/member/household-service.ts`. Each person gets `canMarry = !deceased && age >= MARRIAGE_AGE today && not in liveSpouseIds`. The age comes from the rows already loaded, and live spouses come from one `inArray` query in a new repository function, `liveSpouseIds(personIds: string[]): Promise<Set<string>>`, so there is no query per person.
- Modify: `household.int.test.ts`
- Create: `src/routes/(member)/profile/household/[id]/married/+page.server.ts`, `+page.svelte`
- Modify: `src/routes/(member)/profile/household/+page.svelte` (a "Got married" row action with `aria-label` "Got married: {name}"), `household.e2e.ts`
- Modify: `messages/*.json`

- [ ] **Step 1: Write the failing tests:**
  - `household.int.test.ts`: `canMarry` is true for an unmarried adult over 19, false for a 17-year-old, and false for a married person.
  - `household.e2e.ts`: `a member records their grown child's marriage`:
    1. Tap "Got married: {child}". The screen shows "Step 1 of 2" with the spouse's name, nickname, sex, birth date and the wedding date.
    2. Next. "Step 2 of 2" shows the address, pre-filled.
    3. Press "Record the marriage" → back on My household, the toast "Recorded the marriage." shows, and the child is no longer listed.

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement.**
  - The two steps live on one page in client state, with one form posting everything at the end. The action calls `recordMarriage` and redirects to `/profile/household?done=married`.
  - A refusal comes back as `fail(400, { error })`. It is shown with `role="alert"`, and the screen returns to the step that holds the field: step 1 for the spouse's or the wedding-date errors.
  - New keys: `household_married`, `household_married_named`, `household_married_step`, `household_married_submit`, `household_done_married`. Each goes in all 4 locales.

- [ ] **Step 4: Run** the int and e2e tests → PASS. Then the full suite: `bun run check`, `npx eslint .`, `bun run test:unit -- --run`, `bun run test:int` and `npx playwright test` → green.

- [ ] **Step 5: Commit** `feat(member): families record a marriage from my household`
