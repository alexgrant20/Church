# Membership 4a: Passed Away and Moved Out — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two life changes, "Passed away" and "Moved out", can be recorded by branch admins on the member record and by a family's adults on a new phone "My household" screen. A branch admin can undo either one.

**Architecture:** One service file per life change in the `member` module (`passed-away.ts`, `moved-out.ts`). Both share one rule that decides who may act (`life-change-access.ts`). Each change is one transaction that writes the person, the account (through two new `auth` service functions) and the audit row. "Move back" finds the old household and address in the latest `person.moved_out` audit row, through a new `findLatestAudit()` in the audit service, so no column is added for it. Staff act from dialogs on `/members/[id]`. Families act from `/profile/household`, with one screen per task.

**Tech Stack:** SvelteKit 2, Svelte 5 runes, Drizzle, zod 4, `sveltekit-superforms`, svelte-sonner, Paraglide JS, Vitest (unit and integration), Playwright. No new dependency.

**Spec:** `docs/superpowers/specs/2026-10-27-membership-design.md`: goal 5, decision 17, calls "Death is a person status", "Moved out", "Passed away", "Undoing life changes", flow 6. Also `docs/superpowers/specs/2026-10-26-foundation-database-design.md`: rule 4 "Moving out", "Access rules", flow 4 "Move out". `CLAUDE.md`, `DESIGN.md`, `src/routes/(admin)/DESIGN.md`, `src/routes/(member)/DESIGN.md` and `src/lib/components/DESIGN.md` are binding.

**User decisions for this plan (2026-11-05):**

- The family side is built here, including a "My household" screen in the member app.
- Staff who may record or undo a life change: `branch_admin` and `superadmin`, within their branch scope. Pastors stay read-only.
- "Moved out" offers the address fields, pre-filled with the current address. The person's own address changes.

**Not in this plan:** "Got married" (plan 4b), adding a newborn, editing other member fields, acting _as_ another household member, notifying anyone of a change.

## Global Constraints

- **Who may act.** Staff: `branch_admin`, `superadmin`, through `scopeFor(['superadmin', 'branch_admin'])`, when the subject's home branch is in scope. A cross-branch (view-only) record never edits. Family: the signed-in person, when they are 17 or over, alive, and in the same live household as the subject. Anyone else gets `NotFoundError`, so nothing confirms the person exists. Undo is staff only.
- **Adult:** `ageOn(birthDate, todayIn(branch timezone)) >= ADULT_AGE` (17), using the subject's home branch timezone, from `src/lib/server/time.ts`.
- **Passed away.** Sets `people.deceased_on`. The date may not be after today (branch timezone) and may not be before the birth date. A person already deceased is refused. A family member cannot record their own death. If the person has an account, it is set to `suspended` and all its sessions are deleted, in the same transaction. Relationship rows are not touched.
- **Undo passed away.** Clears `deceased_on`. A suspended account goes back to `active`. Sessions stay ended.
- **Moved out.** The subject is 17 or over, alive, and not the only live person in their household. One transaction: insert a new household, move only the subject into it, set their address to the submitted one, and audit. Relationship rows stay (Foundation rule 4). Children do not move.
- **Move back.** Reads the latest `person.moved_out` audit row for the person. It is allowed only when the person is still in that row's `after` household, the `before` household still exists, and the person is alive. It moves them back, restores the address fields from the row's `before` values, and soft-deletes the household they leave if no live person remains in it.
- **Audit actions** (entity `person`, entity id = the subject, branch = the subject's home branch), each written by `recordAudit` inside the change's transaction: `person.passed_away`, `person.passed_away_undone`, `person.moved_out`, `person.moved_out_undone`. The diff holds only changed fields, as `{ field: { before, after } }`:
  - `deceasedOn`, and `accountStatus` when an account changed.
  - `householdId`, `addressLine`, `postalCode` and `cityId` when they changed.
- **Errors** are message keys, translated at render time: `error_date_in_future`, `error_before_birth`, `error_already_deceased`, `error_not_deceased`, `error_not_adult`, `error_already_alone`, `error_cannot_record_own_death`, `error_nothing_to_undo`.
- Layers: route → one service function → repository. Only repositories touch `db` / `tx`. Services call other modules' services, never their repositories. No query inside a loop.
- Member screens follow `(member)/DESIGN.md`: 18px body, 48px tap targets, a 56px full-width main action, one task per screen, a toast after an action, no truncation.
- All copy comes from Paraglide in `en`, `id`, `zh-Hans` and `zh-Hant`. Dialogs and confirmations use the shared components, never `confirm()`.
- Functions under ~40 lines, files under ~200 lines. Comments say why, never what.

## Review Focus

1. A death date given as today in Jakarta while it is already tomorrow in UTC (or the reverse) must be judged by the branch's calendar day. Test in Task 3.
2. Two adults in one household recording the same death at the same moment: exactly one succeeds, and the other gets `error_already_deceased`, never a second audit row. Test in Task 3 (the update is guarded by `deceased_on is null`).
3. "Move back" after the person moved out a second time must undo only the latest move, and "Move back" twice must refuse the second time. Test in Task 4.
4. A family adult who is themself deceased, or who moved out last week, must not be able to act on their old household any more. Test in Task 2.
5. A 16-year-old turning 17 tomorrow cannot be moved out today, and can be tomorrow, judged by the branch's calendar day. Test in Task 4.

---

## File Map

| File                                                              | Responsibility                                           |
| ----------------------------------------------------------------- | -------------------------------------------------------- |
| `src/lib/registration/person.ts`                                  | export `addressSchema` (moved out of `personSchema`)     |
| `src/lib/life-change/schema.ts`                                   | `passedAwaySchema`, `movedOutSchema` (client and server) |
| `src/lib/server/modules/auth/service.ts`                          | `suspendAccount()`, `reactivateAccount()`                |
| `src/lib/server/modules/auth/repository.ts`                       | `setAccountStatus()`                                     |
| `src/lib/server/modules/audit/service.ts`                         | `findLatestAudit()`                                      |
| `src/lib/server/modules/member/life-change-repository.ts`         | subject, actor, household and move queries               |
| `src/lib/server/modules/member/life-change-access.ts`             | `lifeChangeActor()`, `staffOnly()`                       |
| `src/lib/server/modules/member/passed-away.ts`                    | `recordPassedAway()`, `undoPassedAway()`                 |
| `src/lib/server/modules/member/moved-out.ts`                      | `recordMovedOut()`, `undoMovedOut()`                     |
| `src/lib/server/modules/member/household-service.ts`              | `getMyHousehold()`, `getHouseholdMember()`               |
| `src/lib/server/modules/member/record-service.ts`                 | add `changes` to `getMember()`                           |
| `src/lib/components/LifeChangeDialogs.svelte`                     | staff dialogs on the record                              |
| `src/routes/(admin)/members/[id]/+page.server.ts`, `+page.svelte` | four form actions, header actions                        |
| `src/routes/(member)/profile/household/…`                         | list, `[id]/passed-away`, `[id]/moved-out`               |
| `e2e-db.ts`                                                       | `e2eFamily()`                                            |
| `messages/*.json`                                                 | new keys in 4 locales                                    |

---

### Task 1: Shared schemas and account status

**Files:**

- Modify: `src/lib/registration/person.ts`. Export `addressSchema = z.object({ line, postalCode, cityId })`, with exactly the rules now inline, and use it in `personSchema`.
- Create: `src/lib/life-change/schema.ts`, `src/lib/life-change/schema.test.ts`
- Modify: `src/lib/server/modules/auth/service.ts`, `src/lib/server/modules/auth/repository.ts`
- Create: `src/lib/server/modules/auth/account-status.int.test.ts`

**Interfaces:**

- Produces:
  - `passedAwaySchema = z.object({ deceasedOn })`. `deceasedOn` is an ISO date, `error_required` when blank, and `error_date_in_future` when after the browser's or server's local today. The service repeats the check with the branch timezone.
  - `movedOutSchema = z.object({ address: addressSchema })`
  - `suspendAccount(tx: Transaction, personId: string): Promise<{ before: 'active' | 'suspended'; after: 'suspended' } | null>`. It returns `null` when the person has no account, and it always deletes the person's sessions.
  - `reactivateAccount(tx: Transaction, personId: string): Promise<{ before: 'suspended'; after: 'active' } | null>`. It returns `null` when there is no account or the account is not suspended.
  - repository: `setAccountStatus(tx, personId, status): Promise<{ before } | undefined>`. One `UPDATE … RETURNING` against a CTE or a prior select is fine; the implementer picks.

- [ ] **Step 1: Write the failing tests:**
  - `schema.test.ts`:
    - `passedAwaySchema` accepts today.
    - It rejects tomorrow with `error_date_in_future`.
    - It rejects `''` with `error_required`.
    - `movedOutSchema` rejects a missing `cityId`.
  - `account-status.int.test.ts` (`makePerson`, `makeAccount`, and a `sessions` row inserted directly):
    - `suspends the account and ends its sessions`: the result is `{ before: 'active', after: 'suspended' }`, the status reads `suspended`, and 0 sessions are left.
    - `returns null for a person with no account`.
    - `reactivates a suspended account`: the result is `{ before: 'suspended', after: 'active' }`.
    - `leaves an active account alone on reactivate`: the result is `null`.
  - Run `bun run test:unit -- --run src/lib/registration` too. The existing person-schema tests must still pass after `addressSchema` is extracted.

- [ ] **Step 2: Run** `bun run test:unit -- --run src/lib/life-change` and `bun run test:int src/lib/server/modules/auth/account-status` → FAIL.

- [ ] **Step 3: Implement.** `suspendAccount` calls `repo.deleteSessionsByPersonId` (already exists) every time, so a reused suspended account cannot keep a session.

- [ ] **Step 4: Run** both test commands, plus `bun run test:unit -- --run src/lib/registration` → PASS.

- [ ] **Step 5: Commit** `feat(auth): suspend and reactivate an account inside a caller's transaction`

---

### Task 2: Who may record a life change

**Files:**

- Create: `src/lib/server/modules/member/life-change-repository.ts`
- Create: `src/lib/server/modules/member/life-change-access.ts`
- Create: `src/lib/server/modules/member/life-change-access.int.test.ts`
- Modify: `src/lib/server/modules/audit/service.ts` (add `findLatestAudit`), with its test in `src/lib/server/modules/audit/latest.int.test.ts`

**Interfaces:**

- Produces:
  - repository:
    - `findSubject(id: string)` → `{ id, fullName, householdId, homeBranchId, birthDate, deceasedOn, addressLine, postalCode, cityId, timezone } | undefined`. It joins `branches` for `timezone` and returns live people only.
    - `livePeopleIn(householdId: string): Promise<number>`
    - `setDeceasedOn(tx, id, date: string | null, expected: 'alive' | 'deceased'): Promise<boolean>`. The `WHERE` guards on the expected state (`deceased_on is null` or `is not null`), so of two racing writes only one updates a row.
    - `insertHousehold(tx): Promise<string>`
    - `moveTo(tx, id, householdId, address: { addressLine, postalCode, cityId })`
    - `softDeleteHousehold(tx, householdId)`
    - `householdExists(householdId): Promise<boolean>` (live rows only)
  - `findLatestAudit(action: string, entityId: string): Promise<{ diff: unknown; createdAt: Date } | undefined>` in the audit service. It is ordered by `created_at desc, id desc`, uses the existing `audit_logs_entity_idx` index, and reads through `db` with no transaction.
  - access:
    - `type Actor = { kind: 'staff' } | { kind: 'family'; personId: string }`
    - `lifeChangeActor(subject: Subject): Promise<Actor>` throws `NotFoundError` when neither rule allows.
    - `staffOnly(subject: Subject): void` throws `NotFoundError` unless the staff rule allows.
    - `type Subject = NonNullable<Awaited<ReturnType<typeof findSubject>>>`

- [ ] **Step 1: Write the failing tests** in `life-change-access.int.test.ts`. Use `asStaff` from `registration/test-support`. For family cases, use `runWithContext` with `personId` set, as `settings.int.test.ts` does.
  - `a branch admin of the home branch is staff`.
  - `a superadmin is staff anywhere`.
  - `a pastor is not allowed`: a pastor of the home branch who is not in the household gets `NotFoundError`.
  - `an admin of another branch is not allowed, even for a household relative`: the subject's household has a person whose home branch is the admin's → `NotFoundError`, because cross-branch is read-only.
  - `an adult in the same household is family`: aged 40 → `{ kind: 'family', personId }`.
  - `a 16-year-old in the household is not allowed`.
  - `a deceased adult in the household is not allowed`.
  - `an adult who moved to another household is not allowed`.
  - `a stranger is not allowed`.
  - `latest.int.test.ts`: `findLatestAudit` returns the newer of two rows for the same action and entity, and `undefined` for another entity.

- [ ] **Step 2: Run** `bun run test:int src/lib/server/modules/member/life-change-access src/lib/server/modules/audit/latest` → FAIL.

- [ ] **Step 3: Implement.** `lifeChangeActor` order:
  1. Try `scopeFor(['superadmin', 'branch_admin'])`. When `branchInScope(scope, subject.homeBranchId)`, return staff. Catch only `ForbiddenError`.
  2. Otherwise read the actor with `findSubject(getContext().personId)`. Return family when the actor is alive, adult (in the actor's own branch timezone) and has `householdId === subject.householdId`.
  3. Otherwise throw `NotFoundError('Person', subject.id)`.

- [ ] **Step 4: Run** → PASS.

- [ ] **Step 5: Commit** `feat(member): who may record a life change, staff or a household adult`

---

### Task 3: Passed away and its undo

**Files:**

- Create: `src/lib/server/modules/member/passed-away.ts`, `passed-away.int.test.ts`

**Interfaces:**

- Consumes: Task 1 (`passedAwaySchema`, `suspendAccount`, `reactivateAccount`) and Task 2 (`findSubject`, `setDeceasedOn`, `lifeChangeActor`, `staffOnly`).
- Produces: `recordPassedAway(personId: string, input: unknown): Promise<void>` and `undoPassedAway(personId: string): Promise<void>`. Both throw `NotFoundError` for a bad uuid or an unknown person, and `ValidationError(<key>)` for a refused rule.

- [ ] **Step 1: Write the failing tests:**
  - `staff records a death; the account is suspended and sessions end`: `deceasedOn` is stored, the account is `suspended`, and there are 0 sessions. One `person.passed_away` audit row has diff `{ deceasedOn: { before: null, after: '2026-10-01' }, accountStatus: { before: 'active', after: 'suspended' } }` and the subject's home branch.
  - `a death without an account has no accountStatus in the diff`.
  - `a household adult records a death`: actor in `runWithContext`, and the audit row's `actorPersonId` is that adult.
  - `a family member cannot record their own death` → `ValidationError` with `error_cannot_record_own_death`.
  - `judges "future" by the branch calendar day`: use `vi.setSystemTime(new Date('2026-10-01T18:00:00Z'))`, which is already 2 October in Jakarta. `deceasedOn: '2026-10-02'` is accepted; `'2026-10-03'` → `error_date_in_future`.
  - `a date before birth is refused` → `error_before_birth`.
  - `recording twice is refused once`: two `recordPassedAway` calls through `Promise.allSettled` → one fulfilled, one rejected with `error_already_deceased`, and exactly 1 audit row.
  - `undo clears the date and reactivates the account`: one `person.passed_away_undone` row with diff `{ deceasedOn: { before: '2026-10-01', after: null }, accountStatus: { before: 'suspended', after: 'active' } }`.
  - `undo of a living person` → `error_not_deceased`.
  - `undo is staff only`: a household adult → `NotFoundError`.

- [ ] **Step 2: Run** `bun run test:int src/lib/server/modules/member/passed-away` → FAIL.

- [ ] **Step 3: Implement.** Parse with `passedAwaySchema`. A `ZodError` becomes `ValidationError` with the first issue's message key; follow how `registration/submit.ts` maps it. Then check the rules in the order the tests name them. Then one `db.transaction`: `setDeceasedOn(…, 'alive')`. If that returns false, throw `error_already_deceased`, so the race is decided by the guarded update and not by a read. Then `suspendAccount`, then `recordAudit`.

- [ ] **Step 4: Run** → PASS.

- [ ] **Step 5: Commit** `feat(member): record and undo a death, suspending the account`

---

### Task 4: Moved out and move back

**Files:**

- Create: `src/lib/server/modules/member/moved-out.ts`, `moved-out.int.test.ts`

**Interfaces:**

- Consumes: Tasks 1 and 2, and `findLatestAudit`.
- Produces: `recordMovedOut(personId: string, input: unknown): Promise<{ householdId: string }>` and `undoMovedOut(personId: string): Promise<void>`.

- [ ] **Step 1: Write the failing tests:**
  - `staff moves an adult into a new household of their own`:
    - The subject's `householdId` is new, and the others are still in the old one.
    - The relationship rows are unchanged.
    - The address equals the input.
    - The `person.moved_out` diff contains `householdId` before/after, plus only the address fields that changed. A test submitting the same address gets a diff with `householdId` only.
  - `a household adult may move themself out`.
  - `a 16-year-old cannot be moved out` → `error_not_adult`.
  - `turning 17 counts by the branch calendar day`: birth date `2009-10-02`, system time `2026-10-01T18:00:00Z` (2 October in Jakarta) → allowed.
  - `the only person in a household cannot move out` → `error_already_alone`.
  - `a deceased person cannot move out` → `error_already_deceased`.
  - `move back restores household and address and closes the empty household`: after the move and then `undoMovedOut`, the subject is in the old household with the old address. The new household has `deletedAt` set. One `person.moved_out_undone` row exists.
  - `move back undoes only the latest move`: moved out to H2, then out again to H3. Undo → the subject is in H2, H3 is soft-deleted, and H2 is still live.
  - `move back twice is refused` → the second call gets `error_nothing_to_undo`.
  - `move back with no move on record` → `error_nothing_to_undo`.
  - `move back is staff only` → a household adult gets `NotFoundError`.

- [ ] **Step 2: Run** `bun run test:int src/lib/server/modules/member/moved-out` → FAIL.

- [ ] **Step 3: Implement.**
  - `recordMovedOut` checks, in order:
    1. Actor.
    2. Alive.
    3. Adult.
    4. `livePeopleIn(householdId) > 1`.
    5. Parse the input.

    Then one transaction: `insertHousehold`, `moveTo` and `recordAudit`. Build the diff from the before and after address and household values, keeping only the changed keys.

  - `undoMovedOut` reads `findLatestAudit('person.moved_out', id)` and gets `before` and `after` from its diff. It refuses with `error_nothing_to_undo` when:
    - there is no row,
    - `subject.householdId !== after.householdId` (this is also what refuses a second undo, since the first one moved them out of `after`), or
    - the `before` household no longer exists.

    Then one transaction: `moveTo` the before household with the before address (unchanged fields come from the subject's current values), soft-delete the left household when `livePeopleIn` is 0 after the move, and `recordAudit`.

- [ ] **Step 4: Run** → PASS.

- [ ] **Step 5: Commit** `feat(member): move an adult into a household of their own, and back`

---

### Task 5: Staff actions on the member record

**Files:**

- Modify: `src/lib/server/modules/member/record-service.ts`. `getMember` adds `changes: { canChange: boolean; canUndoMoveOut: boolean }`. `canChange` is true when `access === 'own'` and staff admin scope includes the home branch. `canUndoMoveOut` is true when `canChange` holds and the latest `person.moved_out` audit row's `householdId.after` equals the person's current household, the same rule `undoMovedOut` applies. Share it as `canMoveBack(subject, latest)` exported from `moved-out.ts`.
- Modify: `src/lib/server/modules/member/record.int.test.ts`
- Create: `src/lib/components/LifeChangeDialogs.svelte`
- Modify: `src/routes/(admin)/members/[id]/+page.server.ts`, `+page.svelte`
- Create: `src/routes/(admin)/members/life-change.e2e.ts`
- Modify: `e2e-db.ts`. Add `e2eFamily(): Promise<{ adult: string; spouse: string; child: string; adultEmail: string }>`. It inserts a JKT household of an activated adult (password copied from `rina@grii.test`, as `ensureStaff` does), a spouse of 40 and a child of 20, all with unique names, so tests never change the seeded Santoso family.
- Modify: `messages/*.json`

**Interfaces:**

- Consumes: Tasks 3 and 4.
- Produces: form actions `?/passedAway`, `?/movedOut`, `?/undoPassedAway` and `?/undoMovedOut` on `/members/[id]`. `LifeChangeDialogs.svelte` takes props `{ record: MemberRecord; forms: { passedAway: SuperValidated<…>; movedOut: SuperValidated<…> } }`.

- [ ] **Step 1: Write the failing tests:**
  - `record.int.test.ts`:
    - `changes.canChange` is true for an admin of the home branch and false for a pastor.
    - It is false for a cross-branch view.
    - `canUndoMoveOut` becomes true after `recordMovedOut` and false after `undoMovedOut`.
  - `life-change.e2e.ts`, using `ensureStaff('e2e-life-admin@grii.test', 'branch_admin')` and `e2eFamily()`:
    - `an admin records a death and undoes it`:
      1. Open the child's record and press "Passed away". The dialog's description names the person. Fill the date and confirm.
      2. The "Deceased" pill shows, along with a toast "Saved".
      3. Press "Undo passed away" and confirm → the pill is gone.
    - `an admin moves an adult out and back`:
      1. On the child's record, press "Moved out", change the address line, and confirm.
      2. The Family tab no longer lists the adult under "This household".
      3. Press "Move back" and confirm → the adult is listed again.
    - `a pastor sees no life-change actions`.

- [ ] **Step 2: Run** the int test and `npx playwright test life-change.e2e` → FAIL.

- [ ] **Step 3: Implement.**
  - The load keeps reading only `params.id`, and it also returns `superValidate(zod4(passedAwaySchema))` and the moved-out form. The moved-out form is pre-filled from `record.person.address`, so `getMember` must also return `cityId`; add it to `toPerson`.
  - Each action calls one service function, maps `ValidationError` to `message(form, key, { status: 400 })` like the register route, maps other errors with `mapErrorToHttp`, and returns `message(form, 'saved')`.
  - Dialogs:
    - "Passed away" uses `Dialog` with a date `Input` and a confirm button whose label names the person: `member_passed_away_confirm` "Record {name} as passed away".
    - "Moved out" uses `Dialog` with `AddressFields`.
    - Both undos use `ConfirmDialog` with `form` set to a hidden form posting to the undo action.
  - Header actions only show when `changes.canChange`. On a phone they go into the header's kebab menu, per `(admin)/DESIGN.md` §4.
  - New message keys:
    - `member_passed_away`, `member_passed_away_title`, `member_passed_away_confirm`, `member_passed_away_date`
    - `member_undo_passed_away`, `member_undo_passed_away_description`
    - `member_moved_out`, `member_moved_out_title`, `member_moved_out_description`
    - `member_move_back`, `member_move_back_description`
    - `common_saved`
    - the 8 `error_*` keys from Global Constraints

    Each goes in all 4 locales. Reuse a key that already exists rather than adding a duplicate.

- [ ] **Step 4: Run** the int and e2e tests → PASS. Run `bun run check` → clean.

- [ ] **Step 5: Commit** `feat(member): staff record and undo life changes from the member record`

---

### Task 6: My household (member app)

**Files:**

- Create: `src/lib/server/modules/member/household-service.ts`, `household.int.test.ts`
- Create: `src/routes/(member)/profile/household/+page.server.ts`, `+page.svelte`
- Create: `src/routes/(member)/profile/household/[id]/passed-away/+page.server.ts`, `+page.svelte`
- Create: `src/routes/(member)/profile/household/[id]/moved-out/+page.server.ts`, `+page.svelte`
- Create: `src/routes/(member)/profile/household/household.e2e.ts`
- Modify: `src/routes/(member)/profile/+page.svelte` (a 48px "My household" link)
- Modify: `messages/*.json`

**Interfaces:**

- Consumes: Tasks 2 to 4.
- Produces:
  - `getMyHousehold(): Promise<{ people: HouseholdPerson[] }>`. `HouseholdPerson = { id, fullName, isSelf, adult, deceased, canRecordDeath, canMoveOut }`. It is ordered by birth date, oldest first. It throws `NotFoundError` when the signed-in person is not an alive adult.
  - `getHouseholdMember(id: string)` returns `{ id, fullName, address }` for a person the signed-in adult may act on, otherwise `NotFoundError`. It uses `lifeChangeActor`.

- [ ] **Step 1: Write the failing tests:**
  - `household.int.test.ts`:
    - `lists my household with what I may do`:
      - Self: `canRecordDeath: false`, and `canMoveOut` true only when someone else lives there.
      - The spouse: both true.
      - A 10-year-old child: `canRecordDeath: true`, `canMoveOut: false`.
      - A deceased member: both false.
    - `a 16-year-old gets NotFoundError`.
    - `getHouseholdMember refuses someone outside my household` → `NotFoundError`.
  - `household.e2e.ts`, with `e2eFamily()`, signed in as the adult:
    - `a member moves their grown child out`:
      1. Profile → "My household" lists the three people.
      2. Tap "Moved out" on the child. The screen's h1 names the child, and the address is pre-filled. Change the city and press the 56px "Move out" button.
      3. Back on the household list, the toast "Moved out. They now have a household of their own." shows and the child is gone from the list.
    - `a member records a death with a confirmation naming the person`:
      1. Tap "Passed away" on the spouse and pick a date.
      2. The alert dialog says "Record {spouse} as passed away?" Confirm.
      3. The spouse shows "Deceased" on the list.

- [ ] **Step 2: Run** them → FAIL.

- [ ] **Step 3: Implement.**
  - The list is `<ul>` rows: the name, at 18px, wrapping rather than truncating; and under it the actions as two 48px outlined buttons with 8px between them, shown only when allowed.
  - Each task screen has a `PageTitle`-style h1 naming the person, the fields, and a 56px full-width main button.
  - Passed away opens an `AlertDialog` naming the person before it submits.
  - After success, `redirect(303, '/profile/household?done=moved-out' | '?done=passed-away')`. The list page shows a toast from that query, then removes it from the URL with `replaceState`: "Moved out. They now have a household of their own." / "Recorded as passed away." There is no name in the URL; the list itself shows who changed.
  - Each `+page.server.ts` calls one service function.
  - The member DESIGN.md says "Never ask a member to type something the app already knows", which is why the address is pre-filled.
  - New message keys: `household_title`, `household_link`, `household_passed_away`, `household_moved_out`, `household_move_out_submit`, `household_passed_away_submit`, `household_done_moved_out`, `household_done_passed_away`. Each goes in all 4 locales.

- [ ] **Step 4: Run** the int and e2e tests → PASS. Then the full suite: `bun run check`, `npx eslint .`, `bun run test:unit -- --run`, `bun run test:int` and `npx playwright test` → all green.

- [ ] **Step 5: Commit** `feat(member): my household screen with passed away and moved out`
