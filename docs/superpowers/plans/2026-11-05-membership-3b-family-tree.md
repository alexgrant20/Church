# Membership 3b: Family Tree and Settings — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Staff open a full family tree diagram for a member, across households, with that member highlighted. A superadmin can switch the tree off church-wide from a new Settings screen.

**Architecture:** A new `settings` module reads and writes `system_settings` through one typed map of known keys. The `member` module gains a tree repository, a pure layout function and a tree service. The repository finds everyone connected to the person with one recursive query. The layout function assigns each person a generation row and a column. The tree service reuses `memberScope()`, `viewAccess()` and the cross-branch audit from plan 3. The screen draws HTML nodes over an SVG of connector lines. Settings is a superadmin-only screen with one switch.

**Tech Stack:** SvelteKit 2, Svelte 5 runes, Drizzle (`db.execute` for the recursive CTE), zod 4, `sveltekit-superforms`, svelte-sonner, Paraglide JS, Vitest (unit and integration projects), Playwright. No new dependency.

**Spec:** `docs/superpowers/specs/2026-10-27-membership-design.md` (decision 15; calls "Family tree access" and "Death is a person status"; data change "`system_settings`: add `membership.family_tree_enabled`"; flow 5). `docs/superpowers/specs/2026-10-26-foundation-database-design.md` (`system_settings`: "Code reads settings through one zod map of known keys, so an unknown key or wrong type fails. Changes are audited. Only superadmin edits."; decision 6, cross-branch view). `CLAUDE.md`, `DESIGN.md`, `src/routes/(admin)/DESIGN.md` and `src/lib/components/DESIGN.md` are binding.

**User decisions for this plan (2026-11-05):**

- The tree shows **everyone connected** to the person through any parent or spouse link, capped at 200 people.
- A minimal superadmin-only **Settings screen** with the family tree switch is built here, along with the typed settings reader and writer.

**Not in this plan:** a switch for `household.adults_act_for_activated_adults` (it gets a key in the map, but no UI), editing relationships from the tree, photos, printing or exporting the tree, life changes (plan 4), directory.

## Global Constraints

- Tree access: `branch_admin`, `pastor` and `superadmin`, within their branch scope. This is `memberScope()`. `group_admin` gets `ForbiddenError`.
- A person outside scope and outside any shared household gets 404, never 403. The same holds when the tree is switched off.
- Opening the tree of a cross-branch person writes `person.viewed_cross_branch` (entity `person`, entity id = the target, branch = the target's home branch), as the record does.
- Every person in the diagram shows a name. A node links to `/members/<id>` only when `viewAccess()` is not null for that person.
- A deceased person stays in the tree with a "Deceased" mark. A non-member shows "Not a member". A soft-deleted person or relationship row never appears and never connects two people.
- Ended spouse links (`ended_on` set) stay in the tree, drawn dashed, because the children of that marriage still hang from it.
- Cap: `TREE_LIMIT = 200` people, nearest first. When the cap is hit, the screen says so.
- `membership.family_tree_enabled`: boolean, default `true`, superadmin only. A missing row reads as the default. A row with the wrong type throws.
- A settings change writes `setting.changed` (entity `system_setting`, entity id = the row id, branch null) with diff `{ value: { before, after } }` in the same transaction. Saving an unchanged value writes nothing.
- Layers: route → service → repository. Only repositories touch `db` / `tx`. No query inside a loop.
- All copy comes from Paraglide in `en`, `id`, `zh-Hans` and `zh-Hant`.
- Functions under ~40 lines, files under ~200 lines. Comments say why, never what.
- Layout sizes are in rem, so the diagram grows with OS text scaling.

## Review Focus

1. Bad data with a cycle (a person recorded as their own grandparent, or a spouse row both ways) must not hang the query or the layout. Tests in Task 2 and Task 3.
2. A person with no relationships at all opens a tree with just themself, not an error or a blank screen. Test in Task 4.
3. A parent who remarried: the children of each marriage sit under the right couple, and no two nodes overlap. Test in Task 3.
4. A soft-deleted person in the middle of a chain must cut the chain, not bridge it, so people only reachable through them drop out. Test in Task 2.
5. Staff who still has the record open after a superadmin switches the tree off must get 404 on the tree URL, not 500. The record must hide the link on its next load. Test in Task 4.

---

## File Map

| File | Responsibility |
| --- | --- |
| `src/lib/server/modules/settings/keys.ts` | `SETTINGS` map, `SettingKey`, `SettingValue<K>` |
| `src/lib/server/modules/settings/repository.ts` | `findSetting()`, `upsertSetting()` |
| `src/lib/server/modules/settings/service.ts` | `getSetting()`, `setSetting()`, `canEditSettings()` |
| `src/lib/server/modules/member/tree-repository.ts` | `connectedPersonIds()`, `treePeople()`, `treeLinks()` |
| `src/lib/server/modules/member/tree-layout.ts` | `layoutTree()`, pure |
| `src/lib/server/modules/member/tree-service.ts` | `getFamilyTree()`, `TREE_LIMIT` |
| `src/lib/server/modules/member/record-service.ts` | add `treeEnabled` to `getMember()` |
| `src/lib/settings/schema.ts` | `settingsFormSchema` (shared client/server) |
| `src/lib/components/FamilyTree.svelte` | diagram |
| `src/routes/(admin)/members/[id]/tree/+page.server.ts`, `+page.svelte` | tree screen |
| `src/routes/(admin)/members/[id]/+page.svelte` | "Family tree" header action |
| `src/routes/(admin)/settings/+page.server.ts`, `+page.svelte` | settings screen |
| `src/routes/(admin)/+layout.server.ts`, `src/lib/components/StaffSidebar.svelte`, `StaffMenuSheet.svelte` | Settings nav item for superadmin |
| `scripts/seed/dev-data.ts` | seed `membership.family_tree_enabled: true` |
| `messages/*.json` | new keys in 4 locales |

---

### Task 1: Settings module

**Files:**
- Create: `src/lib/server/modules/settings/keys.ts`, `repository.ts`, `service.ts`
- Create: `src/lib/server/modules/settings/settings.int.test.ts`
- Modify: `scripts/seed/dev-data.ts` (insert both known keys)

**Interfaces:**
- Produces:
  - `SETTINGS = { 'household.adults_act_for_activated_adults': { schema: z.boolean(), default: true }, 'membership.family_tree_enabled': { schema: z.boolean(), default: true } } as const`
  - `type SettingKey = keyof typeof SETTINGS`, `type SettingValue<K extends SettingKey> = z.infer<(typeof SETTINGS)[K]['schema']>`
  - `getSetting<K extends SettingKey>(key: K): Promise<SettingValue<K>>`
  - `setSetting<K extends SettingKey>(key: K, value: SettingValue<K>): Promise<void>`
  - `canEditSettings(): boolean`, true only for superadmin
  - repository: `findSetting(key: string): Promise<{ id: string; value: unknown } | undefined>`, `upsertSetting(tx, key: string, value: unknown, personId: string | null): Promise<{ id: string }>` (insert … `onConflictDoUpdate` on `key`, sets `updatedByPersonId`)

- [ ] **Step 1: Write the failing tests** in `settings.int.test.ts` (`beforeEach(resetDb)`, `asStaff` from `registration/test-support`):
  - `reads the default when no row exists`: `getSetting('membership.family_tree_enabled')` → `true`.
  - `reads a stored value`: insert `{ key: 'membership.family_tree_enabled', value: false }` → `false`.
  - `throws on a stored value of the wrong type`: insert `value: 'no'` → `getSetting` rejects (a `ZodError`).
  - `a superadmin change is stored and audited`: `asStaff('superadmin', null, () => setSetting('membership.family_tree_enabled', false))`, then `getSetting` → `false`. Exactly one `audit_logs` row with `action = 'setting.changed'`, `entityType = 'system_setting'`, `entityId` = the row id, `branchId = null`, `diff` = `{ value: { before: true, after: false } }`. `updatedByPersonId` is the superadmin's person id.
  - `saving the same value writes no audit row`: set `true` while it reads `true` → zero `setting.changed` rows.
  - `a branch admin cannot change a setting`: `asStaff('branch_admin', branch.id, …)` rejects with `ForbiddenError` and the row is unchanged.
  - `canEditSettings` is `true` for superadmin and `false` for branch admin and pastor.

- [ ] **Step 2: Run** `bun run test:int src/lib/server/modules/settings` → FAIL, module not found.

- [ ] **Step 3: Implement** `keys.ts`, `repository.ts` and `service.ts`. `setSetting` order: `scopeFor(['superadmin'])` first, then parse `value` with the key's schema, then read the before value (a missing row means the default), return early if it is equal, and otherwise run `db.transaction` with `upsertSetting` plus `recordAudit`. `canEditSettings` follows the `allowed()` pattern in `member/scope.ts`. Do not export `allowed` from there; it is two lines, so copy it.

- [ ] **Step 4: Run** `bun run test:int src/lib/server/modules/settings` → PASS.

- [ ] **Step 5: Seed.** In `dev-data.ts`, insert `membership.family_tree_enabled: true` next to the existing key, in the same `values([...])`. Run `bun run db:seed` against a fresh dev DB → no error.

- [ ] **Step 6: Commit** `feat(settings): typed settings reader and audited superadmin writer`

---

### Task 2: Tree repository

**Files:**
- Create: `src/lib/server/modules/member/tree-repository.ts`
- Create: `src/lib/server/modules/member/tree-repository.int.test.ts`

**Interfaces:**
- Produces:
  - `connectedPersonIds(rootId: string, limit: number): Promise<string[]>`. The root comes first, then the rest in rough nearest-first order. At most `limit` ids are returned.
  - `treePeople(ids: string[])` returns `{ id, fullName, memberCode, isMember, deceasedOn, householdId, homeBranchId }[]`.
  - `treeLinks(ids: string[])` returns `{ kind: 'parent' | 'spouse', personId, relatedPersonId, endedOn }[]` for live rows (`deleted_at is null`) with both ends in `ids`. It runs one query.

- [ ] **Step 1: Write the failing tests.** Use `makePerson` and direct `personRelationships` inserts. Spouse rows need `personId < relatedPersonId`, so sort the two ids as in `record.int.test.ts`.
  - `walks parents, children and spouses across households`: grandmother → father, father = mother (spouse), father → child, mother's brother via a shared parent. Each person is in their own household. `connectedPersonIds(child.id, 200)` returns all six, and `[0]` is the child.
  - `returns only the root when there are no links`.
  - `terminates on a cycle`: a → b parent, b → a parent (bad data). The result is `[a, b]` in any order after the root, with no hang. Vitest default timeout.
  - `does not follow a soft-deleted relationship`: a → b live, b → c with `deletedAt` set. Result is `[a, b]`.
  - `a soft-deleted person cuts the chain`: a → b → c with b soft-deleted. Result is `[a]`.
  - `stops at the limit, nearest first`: a chain of 6 from the root, `limit = 3` → the root, its direct link, then the next one.
  - `treeLinks` returns a link only when both ends are in `ids`, and it skips soft-deleted rows.

- [ ] **Step 2: Run** `bun run test:int src/lib/server/modules/member/tree-repository` → FAIL.

- [ ] **Step 3: Implement.** `connectedPersonIds` is one `db.execute` with `WITH RECURSIVE`. Add a one-line comment: a join cannot express a walk of unknown depth. Write the SQL in snake_case, following `review-repository.ts:findSameNameAndBirth`. The shape:

```sql
with recursive tree(id) as (
  select ${rootId}::uuid
  union  -- union, not union all: dedupes ids, so cycles end
  select case when r.person_id = t.id then r.related_person_id else r.person_id end
  from tree t
  join person_relationships r
    on (r.person_id = t.id or r.related_person_id = t.id) and r.deleted_at is null
  join people p
    on p.id = case when r.person_id = t.id then r.related_person_id else r.person_id end
   and p.deleted_at is null
)
select id from tree limit ${limit}
```

  The seed row is not checked for `deleted_at`: the service only calls this after `findPersonDetail` found a live root. `treePeople` and `treeLinks` use the Drizzle builder with `inArray` and return `[]` for empty `ids`.

- [ ] **Step 4: Run** the tests → PASS. Run `EXPLAIN` on the CTE against the seeded dev DB and confirm both `person_relationships` indexes (`person_id`, `related_person_id`) are used.

- [ ] **Step 5: Commit** `feat(member): find everyone connected in a family with one recursive query`

---

### Task 3: Tree layout

**Files:**
- Create: `src/lib/server/modules/member/tree-layout.ts`
- Create: `src/lib/server/modules/member/tree-layout.test.ts` (unit project)

**Interfaces:**
- Produces:
  - `type TreeLink = { kind: 'parent' | 'spouse'; from: string; to: string }`. For a `parent` link, `from` is the parent and `to` is the child. This matches the `person_relationships` row: `personId` = parent and `relatedPersonId` = child.
  - `layoutTree(ids: string[], links: TreeLink[], rootId: string): Map<string, { row: number; col: number }>`. `row` 0 is the oldest generation present. `col` is an integer slot within the row, starting at 0.

- [ ] **Step 1: Write the failing tests:**
  - `puts the root alone at 0,0`: `layoutTree(['r'], [], 'r')` → `r: { row: 0, col: 0 }`.
  - `parents sit one row above, children one row below`: p → r, r → c. Rows are p 0, r 1, c 2.
  - `spouses share a row and sit in adjacent columns`: r = s → `|col(r) - col(s)| === 1`, same row.
  - `children of two marriages sit under the right couple`: r = s1 → c1, r = s2 → c2, with s1 left of r and s2 right of r. Then col(c1) < col(c2).
  - `no two people share a slot` for a 3-generation family of 12 with two remarriages. Check that every `row:col` key is unique.
  - `terminates on a cycle`: a → b, b → a. Both get a slot.
  - `a contradictory link keeps the first row assigned`: c is r's child and is also recorded as r's spouse (bad data). This must not throw, c stays one row below r, and every id gets a slot.

- [ ] **Step 2: Run** `bun run test:unit -- --run src/lib/server/modules/member/tree-layout` → FAIL.

- [ ] **Step 3: Implement `layoutTree`.** The algorithm, since the tests do not pin it:
  1. **Generation.** Do a BFS from `rootId` over links in both directions. Parent is −1, child +1, spouse 0. The first value assigned wins. Shift the values so the minimum is row 0.
  2. **Couples.** In each row, union spouses (only spouse links whose two ends share a row) into units. Inside a unit, keep the BFS discovery order.
  3. **Order.** Order the top row's units by BFS discovery order. For each lower row, order the units by the mean `col` of the parents of their members, which are already placed. Units with no placed parent go last, in BFS order. Then assign columns left to right with no gap.

  Keep each step its own function so each stays under ~40 lines.

- [ ] **Step 4: Run** → PASS.

- [ ] **Step 5: Commit** `feat(member): lay a family out by generation with couples side by side`

---

### Task 4: Tree service and record flag

**Files:**
- Create: `src/lib/server/modules/member/tree-service.ts`
- Create: `src/lib/server/modules/member/tree.int.test.ts`
- Modify: `src/lib/server/modules/member/record-service.ts` (`getMember` adds `treeEnabled: boolean`)
- Modify: `src/lib/server/modules/member/record.int.test.ts` (one case)

**Interfaces:**
- Consumes: `getSetting` (Task 1); `connectedPersonIds`, `treePeople`, `treeLinks` (Task 2); `layoutTree` (Task 3); `memberScope`, `viewAccess`, `findPersonDetail`, `householdBranchIds`, `recordAudit` (existing).
- Produces:
  - `TREE_LIMIT = 200`
  - `getFamilyTree(id: string): Promise<FamilyTree>` where `FamilyTree = { rootId: string; rootName: string; access: 'own' | 'cross'; truncated: boolean; nodes: TreeNode[]; links: (TreeLink & { ended: boolean })[] }` and `TreeNode = { id, fullName, memberCode: string | null, isMember: boolean, deceased: boolean, linkable: boolean, row: number, col: number }`.

- [ ] **Step 1: Write the failing tests** in `tree.int.test.ts`. Reuse the `familyOfBudi()` shape from `record.int.test.ts`: copy it into a shared `member/test-family.ts` and import it from both files.
  - `returns Budi's connected family with layout slots`: as admin of branch a, the nodes are Budi, Sari, Andi, Mother and Son. Aunt is in the household with no relationship row, so she is not in the tree. Budi's `row` is greater than Mother's and less than Andi's. `truncated` is `false`.
  - `a lone person gets a tree of one`: a person with no links → one node, `links: []`.
  - `marks linkable by the cross-branch rule`: as admin of branch a, Son (branch b, own household) has `linkable: false`. Sari (branch b, Budi's household) has `linkable: true`.
  - `marks ended spouse links`: set `endedOn` on Budi and Sari's row → that link has `ended: true`, and Sari is still a node.
  - `a cross-branch tree is audited once`: as admin of branch b, opening Budi's tree writes one `person.viewed_cross_branch` row for Budi with branch a.
  - `pastor may open it; group admin may not`: pastor of branch a resolves. `group_admin` rejects with `ForbiddenError`.
  - `outside scope is 404`: admin of an unrelated branch c → `NotFoundError`.
  - `switched off is 404`: store `membership.family_tree_enabled = false` → `NotFoundError` even for superadmin.
  - `caps at TREE_LIMIT`: a chain of 201 people inserted in one batch → 200 nodes and `truncated: true`. Call `connectedPersonIds(rootId, TREE_LIMIT + 1)` to detect the overflow.
  - In `record.int.test.ts`: `getMember` returns `treeEnabled: true` by default and `false` after the setting is stored as false.

- [ ] **Step 2: Run** `bun run test:int src/lib/server/modules/member` → the new cases FAIL.

- [ ] **Step 3: Implement `getFamilyTree`**, in this order:
  1. Validate the uuid, as `getMember` does.
  2. If the setting is off, throw `NotFoundError`.
  3. Call `memberScope()`.
  4. `findPersonDetail`, then `viewAccess` with `householdBranchIds([householdId])`. If null, throw `NotFoundError`.
  5. Write the cross-branch audit, as `getMember` does.
  6. Call `connectedPersonIds(id, TREE_LIMIT + 1)`, slice to `TREE_LIMIT`, then call `treePeople`, `treeLinks` and `householdBranchIds` (all households of the nodes, deduped) through `Promise.all`.
  7. Call `layoutTree` and map to `TreeNode`.

  Add `treeEnabled` to `getMember` with `getSetting('membership.family_tree_enabled')` in its existing flow.

- [ ] **Step 4: Run** `bun run test:int src/lib/server/modules/member` → PASS, including the existing record tests.

- [ ] **Step 5: Commit** `feat(member): family tree service behind the church-wide switch`

---

### Task 5: Settings screen

**Files:**
- Create: `src/lib/settings/schema.ts`: `settingsFormSchema = z.object({ familyTreeEnabled: z.boolean() })`
- Create: `src/routes/(admin)/settings/+page.server.ts`, `+page.svelte`
- Create: `src/routes/(admin)/settings/settings.e2e.ts`
- Modify: `src/routes/(admin)/+layout.server.ts` (add `canEditSettings: canEditSettings()`), `src/lib/components/StaffSidebar.svelte` and `StaffMenuSheet.svelte` (a Settings item at the bottom, shown only when `canEditSettings`, with the `settings` lucide icon)
- Modify: `messages/{en,id,zh-Hans,zh-Hant}.json`

**Interfaces:**
- Consumes: `getSetting`, `setSetting`, `canEditSettings` (Task 1).
- Produces: route `/settings`, superadmin only.

- [ ] **Step 1: Write the e2e test** `settings.e2e.ts`, using `ensureStaff` and `signIn` as in `member-record.e2e.ts`:
  - `a superadmin turns the family tree off and on`: open `/settings` → select "No" under "Family tree", press Save, and the "Saved" toast shows. Reload → "No" is still checked. Set it back to "Yes" and save, so later tests run with it on.
  - `a branch admin gets 403 and sees no Settings item`: `page.goto('/settings')` responds 403, and the nav has no "Settings" link.

- [ ] **Step 2: Run** `bun run test:e2e src/routes/(admin)/settings` → FAIL.

- [ ] **Step 3: Implement.**
  - The load checks `canEditSettings()` and throws `error(403)` when it is false. It then returns `superValidate({ familyTreeEnabled: await getSetting('membership.family_tree_enabled') }, zod4(settingsFormSchema))`.
  - The `default` action validates the form, calls `setSetting`, maps errors with `mapErrorToHttp`, and returns `message(form, 'saved')`.
  - The page follows `(admin)/DESIGN.md` §5: one section row with the label column ("Family tree" and the description "Lets staff open a diagram of a member's whole family. Turn it off to hide it for every branch."), a `--raised` panel holding `YesNo`, and one Save button.
  - Show a `toast.success` when the form message is `saved`.
  - New message keys: `nav_settings`, `settings_title`, `settings_family_tree_title`, `settings_family_tree_description`, `settings_saved`, in all 4 locales.

- [ ] **Step 4: Run** the e2e test → PASS. Run `bun run check` and `bun run lint` → clean.

- [ ] **Step 5: Commit** `feat(settings): superadmin settings screen with the family tree switch`

---

### Task 6: Family tree screen

**Files:**
- Create: `src/lib/components/FamilyTree.svelte`
- Create: `src/routes/(admin)/members/[id]/tree/+page.server.ts`, `+page.svelte`, `page.server.test.ts`
- Create: `src/routes/(admin)/members/family-tree.e2e.ts`
- Modify: `src/routes/(admin)/members/[id]/+page.svelte` (an outlined "Family tree" link button in the header actions when `r.treeEnabled`)
- Modify: `messages/{en,id,zh-Hans,zh-Hant}.json`

**Interfaces:**
- Consumes: `getFamilyTree`, `FamilyTree`, `TreeNode` (Task 4).
- Produces: route `/members/<id>/tree`. `FamilyTree.svelte` takes props `{ tree: FamilyTree }`.

- [ ] **Step 1: Write the failing tests:**
  - `page.server.test.ts`: `does not read the URL`. Copy the proxy test from `members/[id]/page.server.test.ts` and mock `getFamilyTree`, for the same reason: it audits cross-branch views.
  - `family-tree.e2e.ts`:
    - `a branch admin opens Budi's tree`: from Budi's record, click "Family tree". The h1 is "Family tree" and the second line is Budi's name. The node with `aria-current="true"` contains "Budi". A link named `/^Sari/` is visible.
    - `the tree link and URL disappear when switched off`: set the setting to `false` through `sql`, then reload Budi's record → no "Family tree" link, and `/members/<budi>/tree` responds 404. Restore it to `true` in `finally`.

- [ ] **Step 2: Run** them → FAIL.

- [ ] **Step 3: Implement.**
  - `+page.server.ts` reads only `params.id`, calls `getFamilyTree`, and maps errors with `mapErrorToHttp`.
  - `+page.svelte`: a `PageTitle` with `title` "Family tree" and `finding` set to the root's name. When `tree.truncated`, `finding` instead reads "Showing the 200 closest relatives". Below it goes `<FamilyTree {tree} />`, and a back link to the record.
  - `FamilyTree.svelte`:
    - It is a scrollable `relative` box (`overflow-auto`) sized to the grid. Constants in rem: node `10rem × 3.5rem`, column gap `1.5rem`, row gap `3rem`. A node sits at `left = col × 11.5rem` and `top = row × 6.5rem`.
    - An `aria-hidden` SVG draws the lines. A spouse is a horizontal line between the two nodes, dashed when `ended`. A child gets an elbow path from the midpoint of its recorded parents (or from its single parent) to the top of the child.
    - The nodes are a `<ul>` of absolutely placed `<li>`. Each holds an `<a>` when `linkable`, otherwise a `<div>`, with the name, the Member ID in mono (or a "Not a member" pill), and a "Deceased" pill.
    - The root gets `aria-current="true"` and a `#8C0001` 2px border.
    - On mount, `scrollIntoView({ block: 'center', inline: 'center' })` on the root node.
    - Nodes are at least 48px tall, so they work as tap targets.
  - New message keys: `member_family_tree`, `member_family_tree_truncated` (with a `{count}` param), `member_back_to_record`, in all 4 locales.

- [ ] **Step 4: Run** the unit test and e2e test → PASS. Then run the full suite: `bun run check`, `bun run lint`, `bun run test:unit -- --run`, `bun run test:int` and `bun run test:e2e` → all green.

- [ ] **Step 5: Commit** `feat(member): family tree screen with the member highlighted`
