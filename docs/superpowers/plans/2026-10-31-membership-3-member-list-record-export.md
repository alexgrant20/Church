# Membership 3: Staff Member List, Member Record, and Export — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Staff browse and search their branch's members, open a member's record with their family grouped by household, open a relative from another branch read-only (audited), and export the filtered list as `.xlsx`.

**Architecture:** A new `member` module (`src/lib/server/modules/member/`) holds the list, record, cross-branch view, and export services over one repository, following the `registration/review-*` pattern: a scope function picks the allowed roles, `getAccessibleBranchIds()` turns them into branch ids, repositories filter by them, and `toPage()` builds keyset pages. Screens are thin routes under `src/routes/(admin)/members/` that reuse `VirtualTable`, `createInfiniteList`, `CitySelect`, `BranchSelect`, `UnderlineTabs`, and `PageTitle`.

**Tech Stack:** SvelteKit 2, Svelte 5 runes, Drizzle, zod 4, `exceljs` (new; streaming workbook writer), Paraglide JS, Vitest (integration project), Playwright.

**Spec:** `docs/superpowers/specs/2026-10-27-membership-design.md` (goal 4; decisions 14, 20; calls "Who sees members", "Staff member list", "Export permission", "Export household column", "Death is a person status"; flow 5), and `docs/superpowers/specs/2026-10-26-foundation-database-design.md` (decisions 6, 7; "Cross-branch views are audited"; "Access rules"). `CLAUDE.md`, `DESIGN.md`, `src/routes/(admin)/DESIGN.md`, and `src/lib/components/DESIGN.md` are binding.

**User decisions for this plan (2026-10-31):**

- `people.deceased_on` is added here, with the active/deceased filter. The "Passed away" action that sets it (and suspends the account) is plan 4.
- Export uses `exceljs`.
- `canViewPerson()` and the audited cross-branch read are built here.
- The full family tree diagram, its settings reader, and `membership.family_tree_enabled` are a separate plan 3b.

**Not in this plan:** editing a member, photos (no upload exists yet; the header card shows no photo), life changes, directory, family tree diagram, Groups and Giving tabs (their modules do not exist; DESIGN.md says a destination that does not exist is not shown).

## Global Constraints

- Who sees the member list and record: `branch_admin`, `pastor`, `superadmin`, within their branch scope. `group_admin` gets `ForbiddenError`. NIK shows masked (`3174••••••••0001`) to these roles only.
- Export: `branch_admin` and `superadmin` only (a permission checked in the export service, not a role); a pastor gets `ForbiddenError`. Own branch scope only.
- Export columns, in this order: Member ID, full name, nickname, sex, birth date, household, phone, email, city, home branch, baptism status, sidi status. Never NIK, photo, or the phone and email of anyone under 17. At most 10,000 rows per file. Every export writes one `members.exported` audit row with the filters and the row count in the diff, never the rows.
- Household column = the Member ID of the oldest adult (17 or over) member in the household.
- A deceased person drops out of the default member list and out of exports.
- Non-members (`is_member = false`) never appear in the member list or export; they appear in a family list labelled "not a member".
- Cross-branch view: staff may read, never edit, a person who shares a household with any person whose home branch is in the staff member's scope. Every such read writes `person.viewed_cross_branch` (entity `person`, entity id = the target, branch = the target's home branch).
- Adult = age 17 or over from `birth_date`, a code constant.
- Search by name, nickname, Chinese name, or Member ID. Filter by city and status (active, deceased); superadmin also filters by branch.
- Lists: keyset pagination, default 50, max 100 (`parsePage` / `toPage` in `src/lib/server/pagination.ts`), infinite scroll, only visible rows rendered.
- Layers: route → service → repository; only repositories touch `db` / `tx`. No N+1: no query inside a loop. Every write (here: audit rows only) inside `db.transaction` with `recordAudit` / `recordAudits`.
- All copy from Paraglide in `en`, `id`, `zh-Hans`, `zh-Hant`, including export headers and values. Church terms (Kebaktian, Warta, sidi) stay as names.
- Functions under ~40 lines, files under ~200 lines. Comments say why, never what.

## Review Focus

1. A search with `%`, `_`, or `\` in it must match those characters literally, not act as a wildcard or error. Test in Task 3.
2. A staff member who passes another branch's `branchId` in the URL must get 403, not that branch's members; a superadmin passing a bogus `branchId` gets an empty list, not 500. Test in Task 3.
3. Two members with the same full name must both appear across a page boundary, with no row skipped or repeated. Test in Task 3.
4. A 16-year-old's phone and email must be blank in the export even when the export runs on the day before their 17th birthday in Jakarta while it is already that birthday in UTC (and vice versa). Test in Task 5.
5. Opening the URL of a person outside scope and outside any shared household must give 404 (not 403), so the URL does not confirm the person exists. Test in Task 4.

---

## File Map

| File | Responsibility |
| --- | --- |
| `src/lib/server/db/schema/people.ts` | add `deceasedOn`, list index |
| `src/lib/server/time.ts` | `yearIn`, `todayIn`, `ageOn`, `ADULT_AGE` (moved from `registration/approve.ts`) |
| `src/lib/server/modules/member/scope.ts` | `memberScope()`, `exportScope()`, `canSeeMembers()` |
| `src/lib/server/modules/member/repository.ts` | list, count, export rows, household heads |
| `src/lib/server/modules/member/record-repository.ts` | person detail, household, relationships, household branches |
| `src/lib/server/modules/member/access.ts` | `canViewPerson()` |
| `src/lib/server/modules/member/filters.ts` | `memberFiltersSchema`, `MemberFilters` |
| `src/lib/server/modules/member/list-service.ts` | `listMembers()`, `countMembers()` |
| `src/lib/server/modules/member/record-service.ts` | `getMember()` |
| `src/lib/server/modules/member/export-service.ts` | `exportMembers()` |
| `src/lib/server/modules/member/xlsx.ts` | `membersXlsxStream()` |
| `src/routes/api/members/+server.ts` | JSON page endpoint |
| `src/routes/(admin)/members/+page.server.ts`, `+page.svelte` | list screen |
| `src/routes/(admin)/members/export/+server.ts` | `.xlsx` download |
| `src/routes/(admin)/members/[id]/+page.server.ts`, `+page.svelte` | record screen |
| `src/lib/components/MemberFilters.svelte` | search, city, branch toolbar |
| `src/lib/components/StaffSidebar.svelte`, `StaffMenuSheet.svelte`, `src/routes/(admin)/+layout.*` | Members nav item |

Integration tests are `*.int.test.ts` next to the module; they use `asStaff()` from `src/lib/server/modules/registration/test-support.ts` and the factories in `src/lib/server/db/test/factories.ts`.

---

### Task 1: `deceased_on`, list index, and shared time helpers

**Files:**

- Modify: `src/lib/server/db/schema/people.ts`, `src/lib/server/modules/registration/approve.ts` (import `yearIn` instead of its local copy), `drizzle/` (new migration only; never delete existing ones)
- Create: `src/lib/server/time.ts`
- Test: `src/lib/server/time.test.ts`, `src/lib/server/db/schema/people-deceased.int.test.ts`

**Interfaces:**

- Produces:
  - `people.deceasedOn`: `date({ mode: 'string' })`, nullable.
  - Index `people_member_list_idx` on `(home_branch_id, full_name, id)` `where is_member and deleted_at is null`.
  - In `time.ts`: `ADULT_AGE = 17`; `yearIn(timeZone: string, now?: Date): number`; `todayIn(timeZone: string, now?: Date): string` (`YYYY-MM-DD`); `ageOn(birthDate: string, today: string): number` (whole years, birthday counted on the day itself; 29 February birthdays turn a year older on 1 March in non-leap years).

- [ ] **Step 1: Write the failing tests**

`time.test.ts`:

```ts
it('gives the Jakarta date when UTC is still the day before', () => {
	expect(todayIn('Asia/Jakarta', new Date('2026-12-31T17:30:00Z'))).toBe('2027-01-01');
	expect(yearIn('Asia/Jakarta', new Date('2026-12-31T17:30:00Z'))).toBe(2027);
});
it('counts the birthday itself as the new age', () => {
	expect(ageOn('2009-11-01', '2026-11-01')).toBe(17);
	expect(ageOn('2009-11-01', '2026-10-31')).toBe(16);
});
it('ages a 29 February birthday on 1 March in a non-leap year', () => {
	expect(ageOn('2008-02-29', '2025-02-28')).toBe(16);
	expect(ageOn('2008-02-29', '2025-03-01')).toBe(17);
});
```

`people-deceased.int.test.ts`: `stores a date of death` (`makePerson({ deceasedOn: '2026-10-01' })` reads back `'2026-10-01'`); `is null by default`.

- [ ] **Step 2: Run them to verify they fail.** Run: `bun run test:unit -- --run --project server src/lib/server/time.test.ts` and `bun run test:int -- src/lib/server/db/schema/people-deceased`. Expected: FAIL (module not found / column missing).

- [ ] **Step 3: Implement** the column and index, then `bun run db:generate` (expect one new `drizzle/0006_*.sql` with `ADD COLUMN "deceased_on" date` and `CREATE INDEX "people_member_list_idx"`). Write `time.ts` with `Intl.DateTimeFormat('en-CA', { timeZone, year, month, day })`; move `yearIn` out of `approve.ts` and import it there.

- [ ] **Step 4: Run the tests and the existing approve tests.** Run: `bun run test:unit -- --run --project server`, `bun run test:int`, `bun run db:migrate`. Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add drizzle src/lib/server/db/schema/people.ts src/lib/server/time.ts src/lib/server/time.test.ts src/lib/server/db/schema/people-deceased.int.test.ts src/lib/server/modules/registration/approve.ts
git commit -m "feat(db): date of death on people and shared time helpers"
```

---

### Task 2: Member scope and `canViewPerson()`

**Files:**

- Create: `src/lib/server/modules/member/scope.ts`, `src/lib/server/modules/member/access.ts`, `src/lib/server/modules/member/record-repository.ts`
- Test: `src/lib/server/modules/member/access.int.test.ts`

**Interfaces:**

- Consumes: `getAccessibleBranchIds`, `getContext`, `BranchScope` (`registration/review-repository.ts`; move the type and `inScope` helper to `src/lib/server/modules/branch/access.ts` and re-export, so `member` does not import another module's repository).
- Produces:
  - `memberScope(): BranchScope`: roles `superadmin`, `branch_admin`, `pastor` only; none → `ForbiddenError`.
  - `exportScope(): BranchScope`: roles `superadmin`, `branch_admin` only; none → `ForbiddenError`.
  - `canSeeMembers(): boolean` (true when `memberScope()` does not throw), for the nav.
  - `householdBranchIds(householdIds: string[]): Promise<{ householdId: string; homeBranchId: string }[]>` in `record-repository.ts` (live people only, distinct pairs, one query).
  - `canViewPerson(target: { homeBranchId: string; householdId: string }, scope: BranchScope): Promise<'own' | 'cross' | null>`: `'own'` when the home branch is in scope; `'cross'` when someone in the target's household has a home branch in scope; `null` otherwise. Pure read; the audit row is written by the caller (Task 4).

- [ ] **Step 1: Write the failing tests** (`asStaff`, factories; a household with one person in branch A and one in branch B):
  - `a branch admin of A sees the B person as cross`.
  - `a branch admin of A sees an A person as own`.
  - `a person in an unrelated B household is not viewable`.
  - `a superadmin sees everyone as own`.
  - `a pastor of A gets member scope but not export scope` (`exportScope()` throws `ForbiddenError`).
  - `a group admin is forbidden` (`memberScope()` throws `ForbiddenError`).
  - `a soft-deleted household member does not open the cross-branch view`.

- [ ] **Step 2: Run them to verify they fail.** Run: `bun run test:int -- src/lib/server/modules/member/access`. Expected: FAIL.

- [ ] **Step 3: Implement.**

- [ ] **Step 4: Run them to verify they pass,** plus `bun run test:int -- src/lib/server/modules/registration` (the moved `inScope`). Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/modules/member src/lib/server/modules/branch/access.ts src/lib/server/modules/registration
git commit -m "feat(member): member scope and cross-branch view rule"
```

---

### Task 3: Member list service and endpoint

**Files:**

- Create: `src/lib/server/modules/member/filters.ts`, `src/lib/server/modules/member/repository.ts`, `src/lib/server/modules/member/list-service.ts`, `src/routes/api/members/+server.ts`
- Test: `src/lib/server/modules/member/list.int.test.ts`

**Interfaces:**

- Consumes: Task 2 `memberScope`, `inScope`; `parsePage`, `toPage`, `Cursor`.
- Produces:
  - `memberFiltersSchema` (zod) and `type MemberFilters = { q?: string; cityId?: string; branchId?: string; status: 'active' | 'deceased' }`; `q` trimmed, empty → undefined, max 100; `status` default `'active'`; bad uuid → `ValidationError('error_bad_filter')`.
  - `parseMemberFilters(url: URL): MemberFilters` (reads `q`, `cityId`, `branchId`, `status`).
  - `listMembers(input: MemberFilters & { cursor: Cursor | null; limit: number }): Promise<{ items: MemberRow[]; nextCursor: string | null }>` with `type MemberRow = { id: string; memberCode: string; fullName: string; nickname: string | null; cityName: string; branchName: string; deceasedOn: string | null }`, ordered `(full_name, id)`, cursor key = `full_name`.
  - `countMembers(filters: MemberFilters): Promise<number>`, same filters.
  - Filter rules: `is_member` and `deleted_at is null` always; `active` = `deceased_on is null`, `deceased` = not null; `q` matches `full_name`, `nickname`, `chinese_name` by `ilike '%q%'` and `member_code` by `ilike 'q%'`, with `%`, `_`, `\` escaped; `branchId` outside scope → `ForbiddenError`.
  - `GET /api/members?q=&cityId=&branchId=&status=&cursor=&limit=` returns `listMembers` (route: parse, one service call, `mapErrorToHttp`).

- [ ] **Step 1: Write the failing tests:**
  - `lists only my branch's living members, by name`.
  - `leaves out non-members and soft-deleted people`.
  - `the deceased tab shows only the deceased`.
  - `finds by part of a nickname, a Chinese name, and a Member ID prefix` (`'王美'`, `'jkt-2026'` lowercase).
  - `treats % and _ in a search as plain characters` (a person named `Budi_100%` is found by `'_100%'`; `'%'` alone does not return everyone).
  - `filters by city`.
  - `pages two people with the same name without skipping or repeating` (51 people named `Sari`: 50 + cursor, then 1; ids disjoint).
  - `a branch admin asking for another branch is forbidden`; `a superadmin filters by any branch`; `a superadmin with an unknown branch id gets an empty list`.
  - `counts with the same filters`.

- [ ] **Step 2: Run them to verify they fail.** Run: `bun run test:int -- src/lib/server/modules/member/list`. Expected: FAIL.

- [ ] **Step 3: Implement.** One select joining `cities` and `branches`; keyset `(full_name, id) > (cursor.key, cursor.id)`; `limit + 1` rows into `toPage`.

- [ ] **Step 4: Run them to verify they pass.** Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/modules/member src/routes/api/members
git commit -m "feat(member): searchable member list service and endpoint"
```

---

### Task 4: Member record service

**Files:**

- Create: `src/lib/server/modules/member/record-service.ts`
- Modify: `src/lib/server/modules/member/record-repository.ts`
- Test: `src/lib/server/modules/member/record.int.test.ts`

**Interfaces:**

- Consumes: Task 2 `memberScope`, `canViewPerson`, `householdBranchIds`; `decryptNik`, `maskNik`; `recordAudit`.
- Produces `getMember(id: string): Promise<MemberRecord>`:

```ts
type Relative = {
	id: string;
	fullName: string;
	memberCode: string | null; // null for a non-member
	relation: 'spouse' | 'parent' | 'child' | 'household';
	deceased: boolean;
	linkable: boolean; // canViewPerson() is not null for this relative
};
type MemberRecord = {
	access: 'own' | 'cross'; // cross = read-only
	person: {
		id: string;
		memberCode: string | null;
		isMember: boolean;
		fullName: string;
		nickname: string | null;
		chineseName: string | null;
		sex: 'male' | 'female';
		birthDate: string;
		birthCity: string | null;
		nikMasked: string | null;
		address: { line: string; postalCode: string | null; city: string; region: string };
		homeBranch: string;
		deceasedOn: string | null;
	};
	profile: {
		occupation: (typeof OCCUPATIONS)[number]; // from $lib/registration/options
		education: (typeof EDUCATIONS)[number];
		previousChurch: string | null;
		baptism: { date: string; church: string } | null;
		sidi: { date: string; church: string } | null;
	} | null; // null for a non-member
	login: { email: string | null; phone: string | null; activated: boolean } | null;
	family: { household: Relative[]; outside: Relative[] };
};
```

- Rules: not a uuid, unknown, soft-deleted, or `canViewPerson` null → `NotFoundError` (never 403, so the URL confirms nothing). `'cross'` writes `person.viewed_cross_branch` in a transaction before returning. "This household" = live people in the same household except the person; their `relation` comes from a relationship row with the person when one exists, else `'household'`. "Outside" = people linked by a live `parent` or `spouse` row who are in another household. Spouse rows with `ended_on` set are left out. Queries: person detail (one join), household people, relationship rows joined to people, `householdBranchIds` for all relatives' households: four queries in total, whatever the family size.

- [ ] **Step 1: Write the failing tests** (Budi-like household: Budi in A, spouse Sari in B, child Andi in B; Budi's mother in her own household in A; a married son in his own household in B):
  - `shows the person with NIK masked and profile fields`.
  - `groups the household and the family outside it with relations`.
  - `labels a non-member relative with a null Member ID`.
  - `a relative outside scope and outside any shared household is listed but not linkable` (the married son, for a branch admin of A).
  - `opening a household member from another branch is read-only and audited once` (`access: 'cross'`; one audit row `person.viewed_cross_branch` with entity id and branch B).
  - `opening an own-branch person writes no audit row`.
  - `a person outside scope and outside any shared household is not found` (`NotFoundError`).
  - `a non-uuid id is not found`.
  - `uses a fixed number of queries for a family of 8` (spy on the repository functions; each called once).

- [ ] **Step 2: Run them to verify they fail.** Run: `bun run test:int -- src/lib/server/modules/member/record`. Expected: FAIL.

- [ ] **Step 3: Implement.** Split helpers so each stays under 40 lines (`toRelatives`, `toProfile`).

- [ ] **Step 4: Run them to verify they pass.** Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/modules/member
git commit -m "feat(member): member record with family and audited cross-branch view"
```

---

### Task 5: Export service and `.xlsx` writer

**Files:**

- Create: `src/lib/server/modules/member/export-service.ts`, `src/lib/server/modules/member/xlsx.ts`, `src/routes/(admin)/members/export/+server.ts`
- Modify: `src/lib/server/modules/member/repository.ts`, `package.json` (`exceljs`), `messages/*.json`
- Test: `src/lib/server/modules/member/export.int.test.ts`, `src/lib/server/modules/member/xlsx.test.ts`

**Interfaces:**

- Consumes: Task 1 `todayIn`, `ageOn`, `ADULT_AGE`; Task 2 `exportScope`; Task 3 `MemberFilters`, `parseMemberFilters`.
- Produces:
  - `MAX_EXPORT_ROWS = 10_000`.
  - `type ExportRow = { memberCode: string; fullName: string; nickname: string | null; sex: 'male' | 'female'; birthDate: string; household: string | null; phone: string | null; email: string | null; city: string; homeBranch: string; baptized: boolean; sidi: boolean }`.
  - `exportMembers(filters: MemberFilters): Promise<{ rows: ExportRow[]; filename: string }>`: always living members only (a `status: 'deceased'` filter → `ValidationError('error_export_deceased')`); more than 10,000 matches → `ValidationError('error_export_too_large')` (fetch `MAX_EXPORT_ROWS + 1`); phone and email set to null when `ageOn(birthDate, todayIn(row's home branch timezone)) < ADULT_AGE`; household = Member ID of the oldest member aged `ADULT_AGE` or over in that household, else the oldest member, loaded with one `inArray(householdId)` query and picked in memory; one audit row `members.exported`, entity type `member_export`, entity id `crypto.randomUUID()`, branch = `filters.branchId ?? null`, diff `{ filters: { after: <filters> }, rowCount: { after: n } }`, written in a transaction before the rows are returned; filename `members-<todayIn('Asia/Jakarta')>.xlsx`.
  - `membersXlsxStream(rows: ExportRow[], locale: Locale): ReadableStream<Uint8Array>`: `exceljs` `stream.xlsx.WorkbookWriter` over a `PassThrough`, one sheet, header row from messages in `locale`, birth date as a date cell, sex and yes/no translated, each row committed as written.
  - `GET /members/export?q=&cityId=&branchId=` returns the stream with `content-type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` and `content-disposition: attachment; filename="<filename>"`.
  - Messages: `members_export_col_*` (12 headers), `members_export_yes`, `members_export_no`, `error_export_deceased`, `error_export_too_large` in all four locales.

- [ ] **Step 1: Write the failing tests:**
  - `xlsx.test.ts`: `writes the header and one row per member` (read the stream back with `exceljs` `Workbook.xlsx.load`; header cell A1 = `m.members_export_col_member_id({}, { locale: 'en' })`; 12 columns; no column holds a NIK).
  - `export.int.test.ts`: `exports exactly the filtered members`; `blanks contact details of a member under 17` (birth date one day short of 17 in Jakarta time, `vi.setSystemTime` near midnight UTC so UTC and Jakarta dates differ); `shows the oldest adult's Member ID as the household`; `leaves out deceased and non-members`; `refuses a deceased-tab export`; `refuses more than 10,000 rows` (insert 10,001 people in one batched insert); `a pastor cannot export`; `a branch admin cannot export another branch`; `writes one audit row with filters and count, not rows`.

- [ ] **Step 2: Run them to verify they fail.** Run: `bun run test:unit -- --run --project server src/lib/server/modules/member/xlsx.test.ts` and `bun run test:int -- src/lib/server/modules/member/export`. Expected: FAIL.

- [ ] **Step 3: Install and implement.** `bun add exceljs`. The route maps errors with `mapErrorToHttp` before any byte is streamed.

- [ ] **Step 4: Run them to verify they pass.** Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add package.json bun.lock messages src/lib/server/modules/member "src/routes/(admin)/members/export"
git commit -m "feat(member): audited xlsx export of the filtered member list"
```

---

### Task 6: Member list screen and nav item

**Files:**

- Create: `src/routes/(admin)/members/+page.server.ts`, `src/routes/(admin)/members/+page.svelte`, `src/lib/components/MemberFilters.svelte`
- Modify: `src/lib/components/StaffSidebar.svelte`, `src/lib/components/StaffMenuSheet.svelte`, `src/routes/(admin)/+layout.server.ts`, `src/routes/(admin)/+layout.svelte`, `messages/*.json`
- Test: `src/routes/(admin)/members/members.e2e.ts`

**Interfaces:**

- Consumes: Task 3 `listMembers`, `countMembers`, `parseMemberFilters`, `GET /api/members`; Task 2 `canSeeMembers`; `exportScope` (for `canExport`); `CitySelect`, `BranchSelect`, `UnderlineTabs`, `PageTitle`, `VirtualTable`, `createInfiniteList`, `fetchJsonPage`.
- Produces:
  - Layout data gains `canSeeMembers: boolean`. `visibleNav(pendingCount: number | null, canSeeMembers: boolean)`; nav item `{ href: '/members', label: m.nav_members, icon: Users }` placed before Registrations, shown only when `canSeeMembers`.
  - Page data `{ filters: MemberFilters; first: Page<MemberRow>; total: number; canExport: boolean; isSuperadmin: boolean }`.
  - `MemberFilters.svelte` props `{ filters: MemberFilters; showBranch: boolean }`: search box (about 280×36, label visible to screen readers, debounced 250 ms), `CitySelect`, `BranchSelect` when `showBranch`; each change calls `goto` with the new query string (`replaceState: true, keepFocus: true, noScroll: true`).

- [ ] **Step 1: Write the failing e2e tests** (sign in with `signIn`; set a deceased member through `e2e-db.ts` `sql`):
  - As `rina@grii.test`: the sidebar shows Members; `/members` shows the title, the total ("N members" via `formatCount`), tabs Active and Deceased, and Budi's row with his Member ID in Plex Mono; typing part of Budi's nickname filters the list; the Deceased tab shows only the deceased member; Export downloads a file named `members-*.xlsx` (Playwright `waitForEvent('download')`).
  - Signed in as a pastor seeded by the test through `e2e-db.ts`: no Export button.
  - At 390×844: rows become two lines (name and Member ID on line 1, city in grey on line 2) and the page does not scroll sideways.
  - Empty search result shows the empty state sentence, not an empty table.

- [ ] **Step 2: Run them to verify they fail.** Run: `bunx playwright test "src/routes/(admin)/members/members.e2e.ts"`. Expected: FAIL.

- [ ] **Step 3: Implement** per `src/routes/(admin)/DESIGN.md` §3: title row (title left; Export as the one outlined secondary button, shown only when `canExport` and on the Active tab, linking to `/members/export` with the current query); underline tabs; toolbar (filters left, total right); table columns Name (nickname as grey subline), Member ID, City, Branch (superadmin only), Status pill only on the Deceased tab; 48px rows; the error-and-Retry and empty states as on the registrations list. Messages: `nav_members`, `members_title`, `members_count` ({count}), `members_tab_active`, `members_tab_deceased`, `members_tabs`, `members_search_label`, `members_col_*`, `members_empty`, `members_empty_search`, `members_load_error`, `members_export`, `members_deceased`.

- [ ] **Step 4: Run them and the checks.** Run: `bunx playwright test "src/routes/(admin)"`, `bun run check`, `bun run lint`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "src/routes/(admin)" src/lib/components messages
git commit -m "feat(member): staff member list screen with filters and export"
```

---

### Task 7: Member record screen

**Files:**

- Create: `src/routes/(admin)/members/[id]/+page.server.ts`, `src/routes/(admin)/members/[id]/+page.svelte`
- Modify: `messages/*.json`
- Test: `src/routes/(admin)/members/member-record.e2e.ts`

**Interfaces:**

- Consumes: Task 4 `getMember`; `StatusPill`, `UnderlineTabs`, `formatMissing`, `formatDay`.
- Produces: page data `{ record: MemberRecord; tab: 'profile' | 'family' }` (tab from `?tab=`, default `profile`).

- [ ] **Step 1: Write the failing e2e tests:**
  - As `rina@grii.test`, open Budi from the list: header card shows his name at 18/600 and the meta line (Member ID · branch · city); the Profile tab shows NIK masked or a grey dash, baptism and sidi with date and church or "No"; the Family tab shows "This household" with Sari and Andi and their relations.
  - Clicking Sari (home branch KG) opens her record with a "View only" pill and no edit actions; the database then holds one `person.viewed_cross_branch` row for Sari (checked with `e2e-db.ts` `sql`).
  - A random uuid in the URL shows the 404 page.
  - At 390×844 the header card keeps name and meta, cards go full width in the same order, and nothing scrolls sideways.

- [ ] **Step 2: Run them to verify they fail.** Run: `bunx playwright test member-record`. Expected: FAIL.

- [ ] **Step 3: Implement** per `src/routes/(admin)/DESIGN.md` §4: header card (no photo; name, grey meta line, pills for Deceased, Not a member, View only); underline tabs Profile and Family; 6-column grid with a 16px gutter: Personal, Address, Church, Login cards on Profile; two lists on Family, each name a link when `linkable`, else plain text, with a "Not a member" pill where `memberCode` is null and a "Deceased" pill where `deceased`. A missing value is a grey dash (`formatMissing`). Occupation and education labels reuse the registration option messages. Messages: `member_tab_profile`, `member_tab_family`, `member_card_personal`, `member_card_address`, `member_card_church`, `member_card_login`, `member_view_only`, `member_not_member`, `member_family_household`, `member_family_outside`, `member_relation_*` (spouse, parent, child, household), `member_login_activated`, `member_login_not_activated`, `member_family_empty`, plus field labels not already in the registration messages.

- [ ] **Step 4: Run them and the checks.** Run: `bunx playwright test "src/routes/(admin)"`, `bun run check`, `bun run lint`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "src/routes/(admin)/members/[id]" messages
git commit -m "feat(member): member record screen with grouped family"
```

---

### Task 8: Visual check and all gates

**Files:**

- Modify: only files from Tasks 6–7, for fixes the check finds

- [ ] **Step 1: Shoot the screens** with the `design-taste-frontend` skill in app mode (the style is fixed in `DESIGN.md`; do not redraw it): `/members` (both tabs, with a search), `/members/<id>` (both tabs, own and view-only) at 1440, 768, and 390 wide, light and dark. Check sideways overflow and console errors on each.
- [ ] **Step 2: Fix what breaks a DESIGN.md rule;** list each finding and its fix (or why it was kept) in the commit body.
- [ ] **Step 3: Run all gates.** Run: `bun run test:unit -- --run`, `bun run test:int`, `bunx playwright test`, `bun run check`, `bun run lint`. Expected: all pass. (The browser projects need `bunx playwright install chromium` once; ask before downloading.)
- [ ] **Step 4: Commit**

```bash
git add src messages
git commit -m "fix(ui): visual check fixes for the member screens"
```
