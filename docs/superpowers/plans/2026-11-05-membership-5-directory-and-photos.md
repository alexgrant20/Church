# Membership 5: Member Directory and Profile Photos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Members can opt in to a branch directory that other members browse and search. Members, their family and branch admins can upload a profile photo, which shows in the directory, the staff screens, the Me screen, My household and the family tree.

**Architecture:** Photo bytes go to S3-compatible object storage (MinIO in dev and test) through a small `attachment` module. That module stores the `attachments` rows, serves files through one endpoint and runs a per-owner-type access registry. The `member` module owns the person rules: who may view a photo, who may change it, and who may decide a listing. It also owns the `directory_listings` table, the listing service and the directory browse service. Lists get photo ids with one `inArray` query per page. A hidden directory detail is turned into `NULL` in SQL, so it never leaves the database.

**Tech Stack:** SvelteKit 2, Svelte 5 runes, Drizzle, zod 4, Paraglide JS, `@tanstack/svelte-virtual`, Vitest (unit, integration, browser), Playwright. **New dependencies:** `sharp` (approved by the user) and `@aws-sdk/client-s3` (needs the user's confirmation, see Open question 1). New dev and test containers: MinIO.

**Spec:** `docs/superpowers/specs/2026-10-27-membership-design.md`: goal 6, decision 16, calls "Directory fields a member can show", "Death is a person status" and "Non-member records", anti-goals "A child listed in the member directory" and "A non-member counted, listed…", Data changes (`directory_listings`, `directory_listing.changed`), flow 7. Also `docs/superpowers/specs/2026-10-26-foundation-database-design.md`: decision 11, the `attachments` table, "Soft delete only", "Access rules". `CLAUDE.md`, `DESIGN.md`, `src/routes/(member)/DESIGN.md`, `src/routes/(admin)/DESIGN.md` and `src/lib/components/DESIGN.md` are binding.

## Open questions for the user

1. **S3 client dependency.** No S3 client is installed. Bun's built-in `S3Client` cannot be used, because Vitest runs on Node. **Recommendation:** add `@aws-sdk/client-s3`, the standard client, which works with MinIO and every S3-compatible provider. The much smaller `aws4fetch` (request signing over `fetch`) would also do. The plan is written for `@aws-sdk/client-s3`, and only `attachment/storage.ts` would change.
2. **Bytes of a replaced or removed photo.** Under the soft-delete rule, the old `attachments` row is kept with `deleted_at` set, and its object stays in the bucket. A member who removes their photo may expect the picture itself to be gone. **Recommendation:** keep the object, as the rule says. Nothing serves a soft-deleted row (Task 4 tests this). The plan is designed this way. If you want removed photos purged, that is one `deleteObject` after the commit in Task 6.
3. **Photo of a child, set by a household adult who is not direct family** (for example, a grandparent raising a grandchild). Decision 12 says "a direct-family adult". Spec decision 21, and the life changes already built, let any adult of the household act for a child. **Recommendation:** match decision 21, so any household adult may set a child's photo. Life changes and photos would then follow one rule. The plan is designed to decision 12 as written (direct family only). Widening it is a one-line change in `familyMayDecide` plus one test.
4. **Browser caching of photos.** **Recommendation:** send `Cache-Control: private, no-cache` with `ETag: "<sha256>"`. The browser keeps the bytes but asks again on every use. The access check runs before the `304`, so someone who loses access (a listing turned off, a photo hidden) stops seeing the photo straight away. The service worker already caches only build assets, so photos are never stored offline. The plan is designed this way.
5. **A listed member who moves to another branch.** The listing is scoped by the person's current home branch when it is read. So after a transfer it shows in the new branch and disappears from the old one, and the opt-in stays. **Recommendation:** keep this. The other option is to drop the listing on transfer, but branch transfer does not exist yet. The plan is designed this way (Review Focus 1).
6. **The Directory tab for a signed-in person who cannot open the directory** (a non-member staff account). **Recommendation:** hide the tab for them. The layout already loads per-person data, and a tab that leads to a 404 is worse. The plan is designed this way.

## User decisions (2026-11-05)

Spec decision 16 still holds. Listing is opt-in per person and off by default. Children (under 17) are never listed, and turning 17 lists nobody automatically. The directory is branch-scoped. Name and nickname always show once a person is listed. Deceased people drop out.

1. The directory is a NEW bottom-bar destination "Directory" in the member app, next to "Me".
2. Browse A–Z with a search box: every listed member of the viewer's branch in name order, keyset-paginated infinite scroll, virtualized.
3. Search matches full name, nickname, or Chinese name.
4. Who may OPEN the directory: any signed-in, living GRII member (`is_member`) of that branch, including teens who have a login. "That branch" is the viewer's home branch. A viewer sees a listing when the viewer's home branch equals the listed person's home branch.
5. The phone and email shown are the person's LOGIN phone and email (from `accounts`), not separate public contacts. City is the city of their address.
6. When a member switches their listing ON, NO details are ticked at first (only name and nickname show). They tick photo, phone, email or city themselves.
7. Card tap actions: phone opens the dialer (`tel:`), a WhatsApp button opens a chat (`wa.me` with the number in international format), and email opens the mail app (`mailto:`). Each action appears only for a detail the person chose to show.
8. Who may switch a listing on or off and pick its details: the person themself, or a direct-family adult in the same household (spouse, parent, child, sibling; the same rule as life changes, see `relationOf` and `lifeChangeActor`). A family adult may do this ONLY for a person who has no activated login of their own. Anyone with an activated login decides only for themself.
9. Branch admins: (a) the staff member record shows whether the person is listed and which details show; (b) an admin can REMOVE (switch off) a listing, and the removal is audited. Admins cannot switch a listing on. After an admin removes a listing, the person may switch it back on themself.
10. Photo storage: cloud object storage on any S3-compatible service, chosen by configuration (endpoint, region, bucket, access key and secret in `config.ts` env, validated). No provider is decided in code. Development and tests use a local MinIO container in docker-compose (dev and test) that speaks S3.
11. On upload, accept JPEG, PNG or WebP up to 10 MB, and store a square, roughly 512px WebP with all metadata (EXIF/GPS) stripped. This adds ONE image library, `sharp`, plus an S3 client library (Open question 1).
12. Who may upload, change or REMOVE a person's photo: the person themself; a direct-family adult in the household (spouse, parent, child, sibling), but only for a child (under 17) or for an adult with no activated login; and branch admins (`branch_admin` or `superadmin` with the owner's home branch in their scope; not pastors, not cross-branch). The same people may remove a photo, and the person then shows initials.
13. Where photos show: the directory card (only if the person ticked "photo" in their listing), the staff member record header card, the staff member list rows (72px rows), the member's own Me screen and My household list, and the family tree boxes.

**Not in this plan:** church photos for branches (the registry gets no `branch` entry yet; Task 4), cropping in the browser, purging old photo objects (Open question 2), branch transfer, and making a photo required for events.

## Global Constraints

- **Settled rules** (one line of why each):
  - **Photo viewers.** A person's profile photo may be viewed by:
    - the person;
    - any living person in the same household (My household lists them all);
    - staff for whom `canViewPerson(target, memberScope())` is not null (the record and list rule);
    - a living member whose home branch equals the person's home branch, when the person is listable and has a live listing with `show_photo` (the directory rule).

    Family-tree boxes show a photo only on `linkable` nodes, because the serving endpoint checks one person at a time and has no tree context.

  - **Anyone else gets `404`, the same as for an id that does not exist,** so a URL never confirms that a person or photo exists.
  - **"Activated login"** means an `accounts` row with `activated_at is not null`, whatever its status. This is the Foundation "Acting for" rule.
  - **"Listable"** means `is_member`, alive and 17 or over (branch timezone). It is enforced when a listing is written (`error_cannot_be_listed`) and filtered again when the directory is read, so a bad row never shows.
  - **`directory_listings` keeps `person_id` as its primary key.** Removing a listing sets `deleted_at`. Relisting is `insert … on conflict (person_id) do update set show_* = excluded.show_*, deleted_at = null, updated_at = now()`. Why: one row per person stays a database rule without a partial unique index, the row is never hard-deleted, and the audit log keeps the history.
  - **Writes to a person's photo or listing first lock the live person row** (`select … for update`) inside the transaction. This lock is the "owner exists" check from the Foundation spec, and it makes concurrent writes to one person take turns.
  - **A photo upload stores the object first and then commits the row.** If the transaction fails, the object is deleted. A replaced or removed photo keeps its object (soft delete).
  - **The storage key is `person/profile_photo/<crypto.randomUUID()>.webp`.** It is unique, it is never a URL, and it is never shown to anyone.
  - **`sha256` is the hex digest of the stored WebP bytes**, not of the upload, because it describes what is stored and also serves as the ETag.
- **Directory visibility.** A viewer is the signed-in person when they are alive, `is_member` is true and their row is live. A listing shows when `people.home_branch_id = viewer.home_branch_id`, `is_member`, `deceased_on is null`, `deleted_at is null`, `birth_date <= latestAdultBirthDate(todayIn(viewer branch timezone))`, and the listing row is live. The list is ordered by `(full_name, id)`, with keyset pages: default 50, maximum 100 (`parsePage`/`toPage`).
- **Hidden details are `NULL` in SQL** (`case when show_phone then accounts.phone end`, and the same for email and city). A photo id is looked up only for rows with `show_photo`.
- **Audit actions**, each written by `recordAudit`/`recordAudits` inside the change's transaction:
  - `directory_listing.changed`: entity `person`, entity id = the person, branch = the person's home branch. The diff holds only the changed keys among `listed`, `showPhoto`, `showPhone`, `showEmail` and `showCity`, built with the new `changedFields` helper. A save that changes nothing writes no row.
  - `attachment.created`: entity `attachment`, entity id = the attachment id, branch = the owner's home branch. The diff holds `after` values only: `ownerType`, `ownerId`, `purpose`, `contentType`, `sizeBytes`, `sha256`.
  - `attachment.removed`: same entity and branch. The diff is `{ deletedAt: { before: null, after: <iso> } }`.
  - A family actor adds `metadata: { actedAs: <relation> }`, as `actedAs()` does today.
- **Errors** are message keys: `error_cannot_be_listed`, `error_not_listed`, `error_photo_required`, `error_photo_too_large`, `error_photo_type`, `error_no_photo`.
- **Limits** in `src/lib/photo.ts` (shared by client and server): `MAX_PHOTO_BYTES = 10 * 1024 * 1024`, `PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp']`, `PHOTO_SIZE = 512`. In production, adapter-node needs `BODY_SIZE_LIMIT=11M`. Its default of 512K would refuse every photo, and the limit stops an oversized body before it is read.
- **Layers:** route → one service function → repository. Only repositories touch `db`/`tx`, and `attachment/storage.ts` is the only code that talks to S3. Services call other modules' services, never their repositories. No query runs inside a loop.
- **Member screens** follow `(member)/DESIGN.md`: 18px body, 48px tap targets, a 56px full-width main action, one task per screen, a toast after an action, no truncation, and rem sizing so OS text scaling works. **Staff list rows are 72px** with a 48px photo. The record header card carries the photo.
- **Copy:** all of it comes from Paraglide in `en`, `id`, `zh-Hans` and `zh-Hant`. Confirmations use `ConfirmDialog`, never `confirm()`.
- **Size:** functions stay under ~40 lines and files under ~200 lines. Comments say why, never what.

## Review Focus

1. **A listed member whose home branch changes** shows only to members of the new branch, never the old. Test in Task 5.
2. **A detail the person did not tick** (phone, email, city or photo) never appears anywhere in the `/api/directory` JSON, even when the data exists. Test in Task 5.
3. **A photo URL opened by someone who may not see it** (a member of another branch, a same-branch member while `show_photo` is off, a guest) fails exactly like a random id and like a removed photo: `NotFoundError`. Test in Task 4.
4. **A 16-year-old** cannot be listed, by themself or by a parent. A listing row that exists anyway (written directly) stays out of the directory until the day they turn 17 in the branch's timezone. Test in Task 5 (read side) and Task 3 (write side).
5. **Two photo replacements for one person at the same moment** both succeed, leave exactly one live photo, and write two `attachment.created` rows. Neither fails with a unique-index `500`. Test in Task 6.

---

## File Map

| File                                                                               | Responsibility                                                 |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `docker-compose.yml`, `.env.example`, `.env.test`, `src/lib/server/config.ts`      | MinIO dev/test, S3 env, `BODY_SIZE_LIMIT` note                 |
| `src/lib/server/modules/attachment/storage.ts`                                     | `putObject`, `getObject`, `deleteObject` (the only S3 code)    |
| `src/lib/server/modules/attachment/image.ts`                                       | `toProfileWebp()` with sharp                                   |
| `src/lib/server/modules/attachment/repository.ts`                                  | attachment rows                                                |
| `src/lib/server/modules/attachment/registry.ts`                                    | `mayView()` per owner type                                     |
| `src/lib/server/modules/attachment/service.ts`                                     | photo ids per page, serving, store/replace/remove              |
| `src/routes/attachments/[id]/+server.ts`                                           | the single serving endpoint                                    |
| `src/lib/server/db/schema/membership.ts`                                           | `directoryListings` table                                      |
| `src/lib/server/modules/audit/diff.ts`                                             | `changedFields()`                                              |
| `src/lib/server/time.ts`                                                           | `latestAdultBirthDate()`                                       |
| `src/lib/server/modules/member/life-change-repository.ts`                          | `isMember`, `hasLogin` on subjects; `lockLivePerson()`         |
| `src/lib/server/modules/member/decide-for.ts`                                      | pure rules: `listable()`, `familyMayDecide()`                  |
| `src/lib/server/modules/member/editors.ts`                                         | `listingEditor()`, `photoEditor()` (context-aware)             |
| `src/lib/server/modules/member/directory-repository.ts`                            | listing rows and directory page query                          |
| `src/lib/server/modules/member/listing-service.ts`                                 | `getListing`, `saveListing`, `removeListing`, `listingOf`      |
| `src/lib/server/modules/member/directory-service.ts`                               | `canOpenDirectory`, `listDirectory`                            |
| `src/lib/server/modules/member/photo-access.ts`                                    | `canViewPersonPhoto()`                                         |
| `src/lib/server/modules/member/photo-service.ts`                                   | `getPhotoScreen`, `setPersonPhoto`, `removePersonPhoto`        |
| `src/lib/directory/schema.ts`, `src/lib/photo.ts`, `src/lib/format.ts`             | shared schema, photo limits, `initials()`, `whatsappHref()`    |
| `src/lib/components/Avatar.svelte`, `VirtualList.svelte`, `MemberBottomBar.svelte` | photo-or-initials, measured window virtual list, Directory tab |
| `src/routes/(member)/directory/…`, `src/routes/api/directory/+server.ts`           | directory screen and its page endpoint                         |
| `src/routes/(member)/profile/…`                                                    | Me, `photo/[id]`, `listing/[id]`, My household                 |
| `src/routes/(admin)/members/…`, `src/lib/family-tree.ts`, `FamilyTree.svelte`      | staff list, record and tree photos; listing card and removal   |
| `src/routes/(member)/DESIGN.md`                                                    | bottom bar gains Directory                                     |
| `messages/*.json`                                                                  | new keys in 4 locales                                          |

---

### Task 1: Object storage (S3 client, config, MinIO)

**Files:**

- Modify: `package.json`. Add the dependency `@aws-sdk/client-s3` (`bun add @aws-sdk/client-s3`) once Open question 1 is answered.
- Modify: `docker-compose.yml`. Add:
  - `minio` (dev): API on host `55900`, console on `55901`, volume `churchapp_miniodata:/data`.
  - `minio-test`: API on host `55910`, `tmpfs: /data`.
  - `minio-init`: `minio/mc`. It waits for both servers to be healthy, then runs `mc mb --ignore-existing` for `churchapp-dev` and `churchapp-test`.

  Pin both images to an exact `RELEASE.` tag (MinIO stopped publishing new community images in late 2025, so check that the tag pulls). Root user `churchapp` and password `churchapp-minio` (dev only). Keep the non-standard-port comment style.

- Modify: `.env.example`. Add `S3_ENDPOINT=http://127.0.0.1:55900`, `S3_REGION=us-east-1`, `S3_BUCKET=churchapp-dev`, `S3_ACCESS_KEY_ID=churchapp`, `S3_SECRET_ACCESS_KEY=churchapp-minio`, and a comment that production sets `BODY_SIZE_LIMIT=11M` (adapter-node).
- Modify: `.env.test`. Add the same keys, with port `55910` and bucket `churchapp-test`.
- Modify: `src/lib/server/config.ts`, `src/lib/server/config.test.ts`
- Create: `src/lib/server/modules/attachment/storage.ts`, `src/lib/server/modules/attachment/storage.int.test.ts`

**Interfaces:**

- Produces:
  - config keys, required in every environment: `S3_ENDPOINT: z.string().url()`, and `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` each `z.string().min(1)`.
  - `putObject(key: string, body: Uint8Array, contentType: string): Promise<void>`
  - `getObject(key: string): Promise<ReadableStream<Uint8Array>>` rejects for a missing key.
  - `deleteObject(key: string): Promise<void>`
  - One module-level `S3Client` with `forcePathStyle: true`. MinIO requires it, and the common S3-compatible services accept it.

- [ ] **Step 1: Write the failing tests**
  - `config.test.ts`: add the five S3 keys to `base`. New test `rejects a config without S3_BUCKET`: `load({ S3_BUCKET: '' })` rejects with `'Invalid environment configuration'`.
  - `storage.int.test.ts`:
    - `stores, reads back and deletes an object`: put `test/<randomUUID()>` with `new Uint8Array([1, 2, 3])` and type `application/octet-stream`. Reading the stream to bytes equals `[1, 2, 3]`. After `deleteObject`, `getObject` rejects.
    - `rejects reading a key that was never stored`.
- [ ] **Step 2: Run** `docker compose up -d`, then `bun run test:unit -- --run src/lib/server/config` and `bun run test:int src/lib/server/modules/attachment/storage` → FAIL.
- [ ] **Step 3: Implement** the config keys and `storage.ts`.
- [ ] **Step 4: Run** the same commands → PASS.
- [ ] **Step 5: Commit** `feat(attachment): S3-compatible object storage, with MinIO for dev and test`

---

### Task 2: Listing table and the "who decides for a person" rule

**Files:**

- Modify: `src/lib/server/db/schema/membership.ts`. Add `directoryListings`: `personId` uuid primary key referencing `people.id` (restrict), `showPhoto`, `showPhone`, `showEmail` and `showCity` (each boolean, not null, default `false`), `createdAt`, `updatedAt`, `deletedAt` (from `columns.ts`). Export it through `schema/index.ts`.
- Create: the migration, with `bun run db:generate`.
- Modify: `src/lib/server/modules/member/life-change-repository.ts`. Add `isMember: people.isMember` and `hasLogin: sql<boolean>\`${accounts.activatedAt} is not null\``to`subjectColumns`, and left join `accounts`in`findSubject`, `householdMembers`and`livingIn`. Add `lockLivePerson`.
- Create: `src/lib/server/modules/member/decide-for.ts`, `decide-for.test.ts`
- Create: `src/lib/server/modules/audit/diff.ts`, `diff.test.ts`

**Interfaces:**

- Produces:
  - `Subject` gains `isMember: boolean` and `hasLogin: boolean`.
  - `lockLivePerson(tx: Transaction, id: string): Promise<boolean>`: `select id … where id = $1 and deleted_at is null for update`. It returns whether a row was found.
  - `listable(p: Pick<Subject, 'isMember' | 'deceasedOn' | 'birthDate' | 'timezone'>): boolean`. It is true when the person is a member, alive, and `isAdult(p)`.
  - `familyMayDecide(actor: Subject, subject: Subject, links: Link[], what: 'photo' | 'listing'): Exclude<Relation, 'self'> | null`. It returns the direct relation used, or `null`. Rules, all required:
    - `actor.id !== subject.id`;
    - the actor is alive, an adult, and in the same household;
    - `relationOf(...)` is one of `spouse`, `parent`, `child`, `sibling`;
    - if the subject is an adult, `!subject.hasLogin`;
    - if the subject is a child, `what === 'photo'`.

    This file is pure, with no imports from repositories or `db`.

  - `changedFields<T extends Record<string, unknown>>(before: T, after: T): Partial<Record<keyof T, { before: unknown; after: unknown }>>`

- [ ] **Step 1: Write the failing tests**
  - `decide-for.test.ts`: build `Subject` literals. Use birth dates far from any birthday boundary and `timezone: 'Asia/Jakarta'`.
    - `a spouse decides for an adult with no login`: result `'spouse'` for both `'photo'` and `'listing'`.
    - `nobody else decides for an adult with an activated login`: `null` for both.
    - `a parent sets a child's photo even when the child has a login`: `'parent'`.
    - `a parent never lists a child`: `null`.
    - `a grandparent in the household does not decide`: links only grandparent→parent→child, result `null`.
    - `an adult of another household does not decide`: `null`.
    - `a deceased adult does not decide`: `null`.
    - `a 16-year-old sibling does not decide`: `null`.
    - `listable is false under 17, for a non-member, and for the deceased; true for a living adult member`.
  - `diff.test.ts`:
    - `keeps only the fields that changed`: `changedFields({ a: 1, b: 2 }, { a: 1, b: 3 })` equals `{ b: { before: 2, after: 3 } }`.
    - `is empty when nothing changed`: equals `{}`.
- [ ] **Step 2: Run** `bun run test:unit -- --run src/lib/server/modules/member/decide-for src/lib/server/modules/audit/diff` → FAIL.
- [ ] **Step 3: Implement** the table, the migration, the subject columns, `lockLivePerson`, `decide-for.ts` and `diff.ts`.
- [ ] **Step 4: Run** the unit tests above, plus `bun run test:int src/lib/server/modules/member` (all existing member tests must still pass with the wider `Subject`) → PASS. Run `bun run check`.
- [ ] **Step 5: Commit** `feat(member): directory listings table and the rule for deciding for a person`

---

### Task 3: Switching a listing on and off

**Files:**

- Create: `src/lib/directory/schema.ts`. It holds `listingSchema = z.object({ listed: z.boolean(), showPhoto: z.boolean(), showPhone: z.boolean(), showEmail: z.boolean(), showCity: z.boolean() })` and `directoryQuerySchema` (`q`: trimmed, max 100, empty becomes `undefined`, as in `memberFiltersSchema`).
- Create: `src/lib/server/modules/member/editors.ts`, `directory-repository.ts`, `listing-service.ts`, `listing.int.test.ts`

**Interfaces:**

- Consumes: `listable`, `familyMayDecide`, `lockLivePerson`, `changedFields`, `findSubject`, `familyLinks`, `isStaffFor`, `staffOnly`, `subjectOf` (from `passed-away.ts`), `recordAudit`, `cityNames`.
- Produces:
  - In `directory-repository.ts`: `type ListingFlags = { showPhoto: boolean; showPhone: boolean; showEmail: boolean; showCity: boolean }` and `type ListingState = ListingFlags & { listed: boolean }`.
  - editors:
    - `listingEditor(subject: Subject): Promise<{ kind: 'self' } | { kind: 'family'; relation: Relation }>`
    - `photoEditor(subject: Subject): Promise<{ kind: 'self' } | { kind: 'staff' } | { kind: 'family'; relation: Relation }>`

    The order is: self first, then staff (photo only, `isStaffFor`), then `familyMayDecide`. Otherwise both throw `NotFoundError('Person', id)`.

  - repository:
    - `findListing(personId: string, tx = db): Promise<ListingFlags | undefined>` (live row only)
    - `upsertListing(tx, personId, flags: ListingFlags): Promise<void>` (revives a soft-deleted row)
    - `softDeleteListing(tx, personId): Promise<boolean>` (guarded by `deleted_at is null`)
    - `listingContacts(personId): Promise<{ phone: string | null; email: string | null; cityId: string }>`
  - service:
    - `getListing(personId: string): Promise<{ person: { id: string; fullName: string }; state: ListingState; values: { phone: string | null; email: string | null; city: string; photoId: string | null } }>`. It throws `NotFoundError` unless `listingEditor` allows and the subject is `listable`. Task 4 fills `photoId`; until then it is `null`.
    - `saveListing(personId: string, input: unknown): Promise<void>`. A bad input throws `ValidationError(<first issue>)`. `listed: true` for a subject that is not `listable` throws `error_cannot_be_listed`. `listed: false` keeps the stored flags and only soft-deletes.
    - `removeListing(personId: string): Promise<void>` is for staff only (`staffOnly`). It throws `error_not_listed` when no live row exists.
    - `listingOf(personId: string): Promise<ListingFlags | null>` has no guard. Only `getMember`, which has already checked access, uses it.

- [ ] **Step 1: Write the failing tests** in `listing.int.test.ts`. Use a local `asPerson(personId, fn, roles = [])` built on `runWithContext`, as in `household.int.test.ts`, and `asStaff`. Fixtures: one branch and one household: a self adult with an activated login, a spouse with no account, an adult child with an activated login, a 16-year-old with a login, and a non-member spouse with no login (via a spouse link from `insertSpouseLink`).
  - `a member lists themself with nothing ticked`: `findListing` equals all `false`. The audit diff equals `{ listed: { before: false, after: true } }`.
  - `ticking phone records only that change`: the diff equals `{ showPhone: { before: false, after: true } }`.
  - `a save that changes nothing writes no audit row`: the `directory_listing.changed` count is unchanged.
  - `a spouse lists an adult who has no login`: row live, metadata `actedAs: 'spouse'`.
  - `a family adult cannot list someone with an activated login` rejects with `NotFoundError`.
  - `a 16-year-old cannot list themself` rejects with `ValidationError('error_cannot_be_listed')`. `a parent cannot list a 16-year-old` rejects with `NotFoundError`. (Review Focus 4, write side.)
  - `a non-member cannot be listed`: the spouse acting for the non-member gets `error_cannot_be_listed`.
  - `a branch admin cannot switch a listing on` rejects with `NotFoundError`.
  - `a branch admin removes a listing and the person relists themself`: after `removeListing`, `findListing` is `undefined` and the diff is `{ listed: { before: true, after: false } }`. Then the self save with `showCity: true` gives `findListing` `{ …showCity: true }`, the `created_at` of the row is unchanged, and the table has 1 row for the person.
  - `a pastor cannot remove a listing` rejects with `NotFoundError`. `removing a listing that is not there` rejects with `error_not_listed`.
- [ ] **Step 2: Run** `bun run test:int src/lib/server/modules/member/listing` → FAIL.
- [ ] **Step 3: Implement.** `saveListing` takes `lockLivePerson` first, then reads `findListing(personId, tx)` inside the transaction, so two family adults saving at once each diff against the other's result.
- [ ] **Step 4: Run** the same command → PASS.
- [ ] **Step 5: Commit** `feat(member): members switch their directory listing on and off`

---

### Task 4: Serving a photo only to people allowed to see it

**Files:**

- Create: `src/lib/server/modules/attachment/repository.ts`, `registry.ts`, `service.ts`, `read.int.test.ts`
- Create: `src/lib/server/modules/member/photo-access.ts`, `photo-access.int.test.ts`
- Create: `src/routes/attachments/[id]/+server.ts`
- Modify: `src/lib/server/modules/member/listing-service.ts`. `getListing` fills `values.photoId` from `profilePhotoIds`.

**Interfaces:**

- Consumes: `getObject` (Task 1), `findSubject`, `canViewPerson`, `memberScope`, `findListing`, `listable`.
- Produces:
  - repository:
    - `profilePhotoRows(personIds: string[]): Promise<{ ownerId: string; id: string }[]>` (live rows; uses `attachments_owner_position_uniq`)
    - `findLiveAttachment(id: string): Promise<{ id; ownerType; ownerId; storageKey; contentType; sha256 } | undefined>`
  - `profilePhotoIds(personIds: string[]): Promise<Map<string, string>>` maps a person id to an attachment id. An empty input runs no query.
  - `mayView(ownerType: 'person' | 'branch', ownerId: string): Promise<boolean>`. Its only entry is `person → canViewPersonPhoto`. An owner type with no entry gets `false`. Church photos add `branch` later.
  - The staff rule calls `memberScope()` and treats its `ForbiddenError` as "not staff", as `isStaffFor` does. A cross-branch photo fetch writes no audit row, because opening the record already wrote `person.viewed_cross_branch`.
  - `canViewPersonPhoto(personId: string): Promise<boolean>`, built from the viewer rules in Global Constraints. It must not import `attachment/service.ts`, which keeps the module graph acyclic.
  - `openAttachment(id: string, ifNoneMatch: string | null): Promise<{ etag: string; notModified: true } | { etag: string; notModified: false; contentType: string; body: ReadableStream<Uint8Array> }>`. It throws `NotFoundError('Attachment', id)` for a malformed id, a missing or soft-deleted row, or a denied viewer. The access check runs before the ETag comparison.
  - The route `GET` answers `304` or `200`. Headers: `Content-Type`, `ETag: "<sha256>"`, `Cache-Control: private, no-cache` and `X-Content-Type-Options: nosniff`. Errors go through `mapErrorToHttp`.

- [ ] **Step 1: Write the failing tests**
  - `photo-access.int.test.ts`. The target is an adult member of branch A, with a live listing where noted.
    - `the person sees their own photo` → `true`.
    - `a household member sees it; one who moved to another household does not`.
    - `a branch admin and a pastor of the home branch see it; staff of an unrelated branch do not`.
    - `staff whose branch shares the household see it` (the cross-branch `canViewPerson` rule).
    - `a member of the same branch sees it only while the listing shows the photo`: no listing → `false`; listing with `showPhoto: false` → `false`; with `true` → `true`; after `removeListing` → `false`.
    - `a member of another branch never sees it, even when listed with photo`.
    - `a non-member, a deceased viewer and a guest never see it`.
    - `a directory viewer does not see a deceased person's photo`.
  - `read.int.test.ts`. Store real bytes with `putObject` and point `makeAttachment({ storageKey })` at them.
    - `profilePhotoIds maps each person to their live photo`: three people, one with a live photo and one with only a soft-deleted photo. The map has size 1.
    - `serves the bytes with the stored type and an etag`, as the owner: the bytes equal what was stored, and `etag` is `"<sha256>"`.
    - `answers not modified for a matching etag`: `notModified` is `true`.
    - (Review Focus 3) `a forbidden id fails exactly like a guessed one`, as a member of another branch: `openAttachment(realId, null)`, `openAttachment(randomUUID(), null)`, a soft-deleted photo's id and `'not-a-uuid'` all reject with `NotFoundError`. As the same viewer with a matching etag, the real id still rejects (no `304` leak).
    - `denies an owner type with no access rule`: `mayView('branch', randomUUID())` is `false`.
- [ ] **Step 2: Run** `bun run test:int src/lib/server/modules/attachment/read src/lib/server/modules/member/photo-access` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same command → PASS.
- [ ] **Step 5: Commit** `feat(attachment): serve a profile photo only to people allowed to see it`

---

### Task 5: Browsing the directory

**Files:**

- Modify: `src/lib/server/time.ts`, `src/lib/server/time.test.ts`
- Modify: `src/lib/server/modules/member/repository.ts` (export `escapeLike`), `directory-repository.ts`
- Create: `src/lib/server/modules/member/directory-service.ts`, `directory.int.test.ts`
- Create: `src/routes/api/directory/+server.ts`

**Interfaces:**

- Consumes: `profilePhotoIds` (Task 4), `findSubject`, `listable`, `saveListing`/`removeListing` (Task 3, for fixtures).
- Produces:
  - `latestAdultBirthDate(today: string): string`. It returns `${year - 17}-${MM-DD}`, with `02-29` becoming `02-28` in a non-leap year. It matches `ageOn(...) >= ADULT_AGE`.
  - repository: `listDirectoryRows(input: { branchId: string; bornOnOrBefore: string; q?: string; cursor: Cursor | null; limit: number }): Promise<{ id: string; fullName: string; nickname: string | null; city: string | null; phone: string | null; email: string | null; showPhoto: boolean }[]>`. It fetches `limit + 1` rows. It inner joins `directory_listings`, joins `cities`, and left joins `accounts`. Search matches `full_name`, `nickname` or `chinese_name` with `ilike %q%` (escaped).
  - `type DirectoryEntry = { id: string; fullName: string; nickname: string | null; city: string | null; phone: string | null; email: string | null; photoId: string | null }`
  - `canOpenDirectory(): Promise<boolean>`
  - `listDirectory(input: { q?: string; cursor: Cursor | null; limit: number }): Promise<{ items: DirectoryEntry[]; nextCursor: string | null }>`. A viewer who may not open the directory gets `NotFoundError('Directory', '')`.
  - `GET /api/directory?q=&cursor=&limit=`: `json(await listDirectory({ ...parseDirectoryQuery(url), ...parsePage(url) }))`. `parseDirectoryQuery(url: URL): { q?: string }` lives in `directory-service.ts` and throws `ValidationError('error_bad_filter')` when the input is bad.

- [ ] **Step 1: Write the failing tests**
  - `time.test.ts`: `latestAdultBirthDate('2026-11-05')` is `'2009-11-05'`, and `latestAdultBirthDate('2028-02-29')` is `'2011-02-28'`.
  - `directory.int.test.ts`: branches A and B with timezone `Asia/Jakarta`. The viewer is a living member of A with a login. Listings are written with `saveListing` as self (or inserted directly where noted).
    - `lists members of the viewer's branch in name order`: listed `Citra`, `Ani`, `Budi` read as `['Ani', 'Budi', 'Citra']`.
    - `pages by name with a cursor`: with `limit: 2`, the first page has 2 items and a non-null `nextCursor`. The second page holds `['Citra']` with `nextCursor` `null`.
    - `leaves out the unlisted, the removed, the deceased, non-members and other branches`: only the one plain listed member of A remains.
    - (Review Focus 4) `never lists someone under 17, even with a row`: insert `directory_listings` rows directly for one person born the day after `latestAdultBirthDate(todayIn('Asia/Jakarta'))` and one born on that day. Only the second is listed.
    - `search matches full name, nickname or Chinese name`: `q: 'Ling'` finds the nickname `Ling`, `q: '王'` finds `王美玲`, and `q: '%'` finds nobody.
    - `shows only the details the person chose`: listed with `showPhone` only, with an email, a city and a live photo (`makeAttachment`). The entry is `{ phone: '+628111000001', email: null, city: null, photoId: null }`.
    - (Review Focus 2) `the JSON never carries a hidden detail`: same fixture, with `s = JSON.stringify(await listDirectory(…))`. `s` contains neither the email, the city name nor the attachment id.
    - `shows the photo id when the person shows their photo`: `photoId` equals the attachment id.
    - (Review Focus 1) `a listed member who changes branch shows only in the new branch`: update `people.home_branch_id` to B. The A viewer's items no longer include them. A B viewer's items do.
    - `a 15-year-old member with a login may open it`: it resolves.
    - `a non-member, a deceased person and a guest may not`: each rejects with `NotFoundError`, and `canOpenDirectory()` is `false` for each.
- [ ] **Step 2: Run** `bun run test:unit -- --run src/lib/server/time` and `bun run test:int src/lib/server/modules/member/directory` → FAIL.
- [ ] **Step 3: Implement.** Hidden details become `case when … end` in the select. `photoId` comes from one `profilePhotoIds(ids of rows with showPhoto)` call per page.
- [ ] **Step 4: Run** both commands → PASS.
- [ ] **Step 5: Commit** `feat(member): branch directory of listed members`

---

### Task 6: Uploading, replacing and removing a photo

**Files:**

- Modify: `package.json`. Add the dependency `sharp` (`bun add sharp`).
- Create: `src/lib/photo.ts` (the limits in Global Constraints)
- Create: `src/lib/server/modules/attachment/image.ts`, `image.test.ts`
- Modify: `src/lib/server/modules/attachment/repository.ts`, `service.ts`
- Create: `src/lib/server/modules/attachment/write.int.test.ts`
- Create: `src/lib/server/modules/member/photo-service.ts`, `photo.int.test.ts`

**Interfaces:**

- Produces:
  - `toProfileWebp(input: Uint8Array): Promise<{ bytes: Buffer; sha256: string }>`. It sniffs with `sharp(input).metadata()`, ignoring any client type. Only `jpeg`, `png` and `webp` are accepted; anything else, or a decode error, throws `ValidationError('error_photo_type')`. Then `.rotate()`, `.resize(PHOTO_SIZE, PHOTO_SIZE, { fit: 'cover' })` and `.webp({ quality: 80 })`. sharp drops metadata by default, so never call `withMetadata`. `limitInputPixels: 100_000_000` bounds the memory a crafted image can take, and covers every phone camera's default mode.
  - attachment service:
    - `prepareProfilePhoto(file: unknown): Promise<{ bytes: Buffer; sha256: string; sizeBytes: number }>`. A non-`File` or an empty file throws `error_photo_required`. `size > MAX_PHOTO_BYTES` throws `error_photo_too_large` before any decode.
    - `withStoredObject<T>(bytes: Buffer, fn: (storageKey: string) => Promise<T>): Promise<T>`. It stores under a new key and runs `fn`. If `fn` throws, it deletes the object and rethrows.
    - `replaceProfilePhoto(tx: Transaction, input: { ownerId: string; branchId: string; storageKey: string; sha256: string; sizeBytes: number; uploadedByPersonId: string; metadata?: object }): Promise<{ id: string; removedId: string | null }>`. It soft-deletes the live photo, inserts the new row (`contentType: 'image/webp'`, `position: 0`), and audits `attachment.removed` (when there was one) plus `attachment.created` in one `recordAudits` call.
    - `removeProfilePhoto(tx: Transaction, input: { ownerId: string; branchId: string; metadata?: object }): Promise<string | null>` returns the removed id.
  - repository: `insertAttachment(tx, row): Promise<{ id: string }>` and `softDeleteProfilePhoto(tx, ownerId): Promise<{ id: string; deletedAt: Date } | undefined>`.
  - member photo service:
    - `getPhotoScreen(personId: string): Promise<{ person: { id: string; fullName: string }; photoId: string | null; isSelf: boolean }>` (guarded by `photoEditor`)
    - `setPersonPhoto(personId: string, file: unknown): Promise<void>`. The order is: `subjectOf`, `photoEditor`, `prepareProfilePhoto`, `withStoredObject(… db.transaction: lockLivePerson or NotFoundError; replaceProfilePhoto)`.
    - `removePersonPhoto(personId: string): Promise<void>`. It throws `error_no_photo` when there is no live photo.

- [ ] **Step 1: Write the failing tests**
  - `image.test.ts` (unit). Make inputs with `sharp({ create: { width: 1200, height: 800, channels: 3, background: '#8c0001' } })`.
    - `turns a JPEG into a 512 square WebP`: output metadata `format: 'webp'`, `width: 512`, `height: 512`, and `sha256` equals the sha256 hex of `bytes`.
    - `strips EXIF and GPS`: the input is made `.withExif({ IFD3: { GPSLatitudeRef: 'S', GPSLatitude: '6/1 10/1 0/1' } })`. The input metadata has `exif` defined; the output has `exif` `undefined`.
    - `accepts PNG and WebP`.
    - `rejects a GIF and a text file named like a photo`: `sharp(...).gif()` bytes and `Buffer.from('hello')` both reject with `ValidationError('error_photo_type')`.
  - `write.int.test.ts`:
    - `a failed save deletes the stored object`: `withStoredObject(bytes, async (key) => { seen = key; throw new Error('boom') })` rejects with `'boom'`, and `getObject(seen)` rejects.
  - `photo.int.test.ts`. Use `asPerson` with roles. Every actor has a `personId`, because `uploaded_by_person_id` is not null. Fixtures follow Task 3, plus a 10-year-old with a login, an admin and a pastor of the branch, and an admin of another branch.
    - `a member sets their own photo`: 1 live row with `contentType: 'image/webp'`. The sha256 of the stored object's bytes equals the row's `sha256`. `uploadedByPersonId` is the member. One `attachment.created` row whose diff has only `after` keys.
    - `replacing soft-deletes the old photo and keeps its bytes`: 1 live row and 1 with `deletedAt` set. `getObject(old.storageKey)` still resolves. Audits are `attachment.removed` for the old row and `attachment.created` for the new one.
    - `a parent sets a 10-year-old's photo even when the child has a login`: metadata `actedAs: 'parent'`.
    - `a spouse sets the photo of an adult with no login`.
    - `a spouse cannot change the photo of an adult with an activated login` rejects with `NotFoundError`.
    - `a branch admin of the home branch may; a pastor and another branch's admin may not`: the latter two reject with `NotFoundError`.
    - `removing leaves initials`: `profilePhotoIds([id])` has size 0, and there is one `attachment.removed`. A second removal rejects with `error_no_photo`.
    - `a file over 10 MB is refused`: `new File([new Uint8Array(MAX_PHOTO_BYTES + 1)], 'big.jpg', { type: 'image/jpeg' })` rejects with `error_photo_too_large`, and no row is written.
    - `a missing file is refused`: `setPersonPhoto(id, null)` rejects with `error_photo_required`.
    - (Review Focus 5) `two replacements at once leave one live photo`: `Promise.all([set(a), set(b)])` both resolve. Live rows: 1. `attachment.created` rows for the person: 2.
- [ ] **Step 2: Run** `bun run test:unit -- --run src/lib/server/modules/attachment/image` and `bun run test:int src/lib/server/modules/attachment/write src/lib/server/modules/member/photo` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same commands → PASS.
- [ ] **Step 5: Commit** `feat(member): upload, replace and remove a profile photo`

---

### Task 7: Directory screen in the member app

**Files:**

- Modify: `src/lib/format.ts`, `src/lib/format.test.ts`
- Create: `src/lib/components/Avatar.svelte`, `src/lib/components/VirtualList.svelte`
- Modify: `src/lib/components/MemberBottomBar.svelte`, `src/lib/components/components.svelte.test.ts`
- Modify: `src/routes/(member)/+layout.server.ts`, `+layout.svelte`
- Create: `src/routes/(member)/directory/+page.server.ts`, `+page.svelte`, `DirectoryCard.svelte`, `directory.e2e.ts`
- Modify: `src/routes/(member)/DESIGN.md`. In "Shell", the bottom bar has **five** destinations: Home, Worship, Events, Directory, Me.
- Modify: `messages/*.json`, `e2e-db.ts`

**Interfaces:**

- Consumes: `listDirectory`, `canOpenDirectory`, `DirectoryEntry`, `/api/directory`, `createInfiniteList`, `fetchJsonPage`.
- Produces:
  - `initials(name: string): string`: the first character of each of the first two words, uppercased.
  - `whatsappHref(e164: string): string`: `https://wa.me/` plus the digits.
  - `Avatar.svelte` props: `{ photoId: string | null; name: string; class?: string }`. With a photo, it renders `<img src="/attachments/{photoId}" alt="" loading="lazy" decoding="async">` on a white backing (root `DESIGN.md`: photos keep a white backing in dark mode). Without one, it renders `initials(name)` on `--raised`, `aria-hidden`. The size comes from `class` in rem, so it scales with OS text size.
  - `VirtualList.svelte` props: `{ items: T[]; estimate: number; onEnd: () => void; item: Snippet<[T]>; label: string }`. It uses `createWindowVirtualizer` with `measureElement`, because card heights vary with chosen details and text scaling, and member screens scroll the window. It renders `role="list"` and `role="listitem"`.
  - `MemberBottomBar` prop `{ directory: boolean }`. Destinations are `[Directory (/directory, Users icon, m.nav_directory), Me]`, with Directory shown only when `directory` is true.
  - The `(member)` layout load returns `{ person, canOpenDirectory: await canOpenDirectory() }`.
  - `/directory` load: `{ q, first: await listDirectory({ q, cursor: null, limit: 50 }) }`. `q` comes from `parseDirectoryQuery(url)`.
- Screen:
  - `h1` "Directory".
  - A 48px search input labelled "Search by name". It is debounced 250ms and does `goto('?q=…', { replaceState: true, keepFocus: true, noScroll: true })`.
  - The `VirtualList` of `DirectoryCard`s. Each card shows `Avatar` (3.5rem), the name at 18px/600 wrapping, then the nickname and city at 15px in `--muted`. Under them, 48px outlined buttons with an icon and a label, each only when its value is present:
    - Call (`tel:{phone}`)
    - WhatsApp (`whatsappHref(phone)`, `target="_blank" rel="noopener"`)
    - Email (`mailto:{email}`)

    Each button's `aria-label` names the person.

  - Empty, error-with-Retry and loading states follow `components/DESIGN.md`.
- New messages (en): `nav_directory` "Directory", `directory_title` "Directory", `directory_search` "Search by name", `directory_empty` "No one in your branch is listed yet. You can list yourself from Me.", `directory_no_match` "Nobody in your branch matches “{q}”.", `directory_call` "Call", `directory_call_named` "Call {name}", `directory_whatsapp` "WhatsApp", `directory_whatsapp_named` "WhatsApp {name}", `directory_email` "Email", `directory_email_named` "Email {name}", `directory_failed` "The directory could not be loaded." Translate into `id`, `zh-Hans` and `zh-Hant`.

- [ ] **Step 1: Write the failing tests**
  - `format.test.ts`:
    - `initials('Budi Santoso')` is `'BS'`, `initials('andi')` is `'A'`, `initials('王美玲')` is `'王'`, and `initials('  ')` is `''`.
    - `whatsappHref('+628123456789')` is `'https://wa.me/628123456789'`.
  - `components.svelte.test.ts`:
    - `Avatar shows initials without a photo`: the text is `BS` and there is no `img`.
    - `Avatar shows the photo from the attachment endpoint`: `img` `src` ends with `/attachments/abc`.
    - `VirtualList renders far fewer rows than items`: with 1,000 items, fewer than 60 `listitem`s are rendered.
    - `VirtualList asks for more when the end is in view`: with 5 items, `onEnd` has been called.
    - `the bottom bar hides Directory when it is off`: `directory: false` gives no link named "Directory", and `true` gives one with `href` `/directory`.
  - `directory.e2e.ts`. Add `e2eListed(opts)` to `e2e-db.ts`. It inserts a JKT member with an account phone, an email and a `directory_listings` row with `show_phone` only, and returns the name and nickname.
    - `a member finds a listed member and can call or WhatsApp them`: log in as the `e2eFamily()` adult. Tap "Directory" in the bottom bar and type the nickname. The card shows the name. "Call {name}" has `href` `tel:+62…`, "WhatsApp {name}" has `href` `https://wa.me/62…`, and there is no "Email {name}" link.
- [ ] **Step 2: Run** `bun run test:unit -- --run src/lib/format src/lib/components` → FAIL.
- [ ] **Step 3: Implement**, including the messages in four locales and the `DESIGN.md` line.
- [ ] **Step 4: Run** the unit tests, then `bun run test:e2e src/routes/(member)/directory`, then `bun run check` and `bun run lint` → PASS.
- [ ] **Step 5: Commit** `feat(member): directory screen in the member app`

---

### Task 8: Photo and listing screens from Me and My household

**Files:**

- Modify: `src/lib/server/modules/member/household-service.ts` and `household.int.test.ts`. Replace `canOpenMyHousehold` with `getMyProfile`, and move its existing tests onto `getMyProfile().canOpenHousehold`. Extend `HouseholdPerson`.
- Modify: `src/routes/(member)/profile/+page.server.ts`, `+page.svelte`, `household/+page.svelte`
- Create: `src/routes/(member)/profile/photo/[id]/+page.server.ts`, `+page.svelte`
- Create: `src/routes/(member)/profile/listing/[id]/+page.server.ts`, `+page.svelte`
- Create: `src/routes/(member)/profile/photo.e2e.ts`
- Modify: `messages/*.json`

**Interfaces:**

- Consumes: `getPhotoScreen`, `setPersonPhoto`, `removePersonPhoto`, `getListing`, `saveListing`, `familyMayDecide`, `listable`, `profilePhotoIds`, `Avatar`, `ConfirmDialog`, `runAction`.
- Produces:
  - `getMyProfile(): Promise<{ id: string; fullName: string; photoId: string | null; canList: boolean; canOpenHousehold: boolean }>`. Every signed-in person with a live `people` row gets it; anyone else gets `NotFoundError`. `canList` is `listable(self)`.
  - `HouseholdPerson` gains `photoId: string | null`, `canEditPhoto: boolean` and `canEditListing: boolean`:
    - `canEditPhoto` is true for self, or when `familyMayDecide(self, r, links, 'photo')` is not null.
    - `canEditListing` is true when `listable(r)` and (self, or `familyMayDecide(self, r, links, 'listing')` is not null).
  - Actions:
    - `/profile/photo/[id]`: `save` passes `(await request.formData()).get('photo')` to `setPersonPhoto`; `remove` calls `removePersonPhoto`.
    - `/profile/listing/[id]`: `save` builds the `listingSchema` input from the checkboxes (`data.has('listed')`, …).
- Screens (one task each, 56px main action, a toast after saving):
  - **Me:** `Avatar` at 6rem with the name; then links "My photo" to `/profile/photo/{id}` and, when `canList`, "Directory listing" to `/profile/listing/{id}`; then the existing household link.
  - **Photo:** title "My photo", or "Photo of {name}". A large `Avatar`, and a `multipart/form-data` form with `<input type="file" name="photo" accept="image/jpeg,image/png,image/webp">` styled as a 48px "Choose a photo" button. Before submitting, the browser checks `MAX_PHOTO_BYTES` and `PHOTO_TYPES` and shows `error_photo_too_large` or `error_photo_type` under the field without uploading. Save is the 56px main action. "Remove photo" is an outlined button behind `ConfirmDialog` ("Remove the photo of {name}?", confirm "Remove photo").
  - **Listing:** a checkbox "Show {name} in the directory". Under it, four checkboxes (Photo, Phone, Email, City), each with the current value or "Not set" as its description. They are disabled while listing is off, and all start unticked whenever the listing is off (decision 6). One line explains: "Members of your branch see the name and nickname, and the details you tick."
  - **My household:** each row gets a 3rem `Avatar`, plus "Photo" and "Directory listing" buttons when `canEditPhoto` or `canEditListing` is true. Their `aria-label`s name the person.
- New messages (en): `profile_my_photo` "My photo", `profile_listing` "Directory listing", `photo_title_named` "Photo of {name}", `photo_choose` "Choose a photo", `photo_save` "Save photo", `photo_saved` "Photo saved.", `photo_remove` "Remove photo", `photo_remove_confirm` "Remove the photo of {name}?", `photo_removed` "Photo removed.", `photo_limits` "JPEG, PNG or WebP, up to 10 MB.", `listing_show_named` "Show {name} in the directory", `listing_explain` "Members of your branch see the name and nickname, and the details you tick.", `listing_photo` "Photo", `listing_phone` "Phone", `listing_email` "Email", `listing_city` "City", `listing_not_set` "Not set", `listing_saved` "Saved.", `household_photo_named` "Photo: {name}", `household_listing_named` "Directory listing: {name}". Also add the six error keys from Global Constraints: `error_photo_too_large` "The photo is larger than 10 MB.", `error_photo_type` "Choose a JPEG, PNG or WebP photo.", `error_photo_required` "Choose a photo first.", `error_no_photo` "There is no photo to remove.", `error_cannot_be_listed` "Only members aged 17 or over can be listed.", `error_not_listed` "This person is not listed." All in four locales.

- [ ] **Step 1: Write the failing tests**
  - `household.int.test.ts`:
    - `lists each person's photo and what I may change for them`. Reuse `home()`, add a spouse link, a login for the adult child and a photo for Kid. Me: `{ canEditPhoto: true, canEditListing: true }`. Spouse (no login): `{ true, true }`. Kid: `{ canEditPhoto: true, canEditListing: false, photoId: <id> }`. An adult child with an activated login: `{ false, false }`.
    - `getMyProfile tells a 16-year-old they cannot be listed`: `canList` is `false`, and `canOpenHousehold` is `false`.
  - `photo.e2e.ts`. The `e2eFamily()` adult logs in, opens Me, then "My photo". `setInputFiles` uses a JPEG buffer made with sharp; then Save. The toast "Photo saved." appears. On Me, the `img` `src` starts with `/attachments/`, and fetching it with `page.request` answers 200 with `content-type: image/webp`. Then "Remove photo" and confirm: the toast "Photo removed." appears, and Me shows the initials and no `img`.
  - Also in `photo.e2e.ts`: `the listing screen starts with nothing ticked`. Opening "Directory listing" shows the main checkbox unticked, and all four detail boxes are unticked and disabled. Ticking "Show … in the directory" and "City", then Save, shows "Saved.".
- [ ] **Step 2: Run** `bun run test:int src/lib/server/modules/member/household` → FAIL.
- [ ] **Step 3: Implement**, including the messages.
- [ ] **Step 4: Run** the int tests, `bun run test:e2e src/routes/(member)/profile`, `bun run check` and `bun run lint` → PASS.
- [ ] **Step 5: Commit** `feat(member): photos and directory listing from Me and My household`

---

### Task 9: Photos and the listing on staff screens

**Files:**

- Modify: `src/lib/server/modules/member/list-service.ts`, `list.int.test.ts`
- Modify: `src/lib/server/modules/member/record-service.ts`, `record.int.test.ts`
- Modify: `src/lib/server/modules/member/tree-service.ts`, `tree.int.test.ts`, `src/lib/family-tree.ts`, `src/lib/components/FamilyTree.svelte`
- Modify: `src/routes/(admin)/members/+page.svelte`. Set `rowHeight` to 72 and add an `Avatar` (3rem) before the name, on phone too.
- Modify: `src/routes/(admin)/members/[id]/+page.server.ts`, `+page.svelte`
- Create: `src/routes/(admin)/members/[id]/DirectoryCard.svelte`, `PhotoDialog.svelte`
- Modify: `src/routes/(admin)/members/member-record.e2e.ts`, `messages/*.json`

**Interfaces:**

- Consumes: `profilePhotoIds`, `listingOf`, `removeListing`, `setPersonPhoto`, `removePersonPhoto`, `Avatar`, `ConfirmDialog`.
- Produces:
  - `MemberRow` gains `photoId: string | null`, with one `profilePhotoIds` call per page in `listMembers`.
  - `getMember()` gains `photoId: string | null` and `listing: ListingFlags | null`. `changes` gains `canChangePhoto: boolean` (equal to `canChange`) and `canRemoveListing: boolean` (`canChange && listing !== null`).
  - `TreeNode` gains `photoId: string | null`. It is set only when `linkable`, from one `profilePhotoIds` call over the linkable ids.
  - `/members/[id]` actions: `photo` (`setPersonPhoto(params.id, formData.get('photo'))`), `removePhoto` and `removeListing`, each through `runAction`.
- Screens:
  - **Header card:** `Avatar` 4rem.
  - **Header actions** (outlined, in the kebab on phone), when `canChangePhoto`:
    - "Change photo" opens `PhotoDialog` (Dialog on desktop, bottom Sheet on phone). It holds the same file input, with the browser-side checks of Task 8.
    - "Remove photo" goes through `ConfirmDialog`.
  - **`DirectoryCard`** in the Profile tab:
    - "Listed in the directory", followed by the shown details in words ("Shows: phone, city"), or "Shows: name and nickname only".
    - Or "Not listed".
    - When `canRemoveListing`, an outlined "Remove from directory" behind `ConfirmDialog` ("Remove {name} from the directory?", confirm "Remove from directory").
  - **Tree box:** a 2.5rem `Avatar` at the left of each box. The box keeps its rem size.
- New messages (en): `member_photo_change` "Change photo", `member_directory_title` "Directory", `member_directory_listed` "Listed in the directory", `member_directory_shows` "Shows: {details}", `member_directory_name_only` "Shows: name and nickname only", `member_directory_not_listed` "Not listed", `member_directory_remove` "Remove from directory", `member_directory_remove_confirm` "Remove {name} from the directory?", `member_directory_removed` "Removed from the directory." All in four locales.

- [ ] **Step 1: Write the failing tests**
  - `list.int.test.ts`: `each row carries its photo id or null`. With two members, one with a photo, the rows give `photoId` `<id>` and `null`.
  - `record.int.test.ts`:
    - `the record shows the photo and the listing`: `photoId` is the id, and `listing` equals `{ showPhoto: false, showPhone: true, showEmail: false, showCity: true }`.
    - `a branch admin may change the photo and remove the listing; a pastor may not`: admin `{ canChangePhoto: true, canRemoveListing: true }`, pastor `{ false, false }`.
    - `an unlisted person has no listing`: `listing` is `null` and `canRemoveListing` is `false`.
  - `tree.int.test.ts`: `a node the viewer can open carries its photo; one they cannot does not`. The root has a photo, so its node has `photoId: <id>`. A relative in another branch with a photo, who shares no household, has `photoId: null`.
  - `member-record.e2e.ts`: `an admin removes a member from the directory`. With `e2eListed()`, the admin opens the record and sees "Listed in the directory". They choose "Remove from directory" and confirm. The toast appears, and the card reads "Not listed".
- [ ] **Step 2: Run** `bun run test:int src/lib/server/modules/member/list src/lib/server/modules/member/record src/lib/server/modules/member/tree` → FAIL.
- [ ] **Step 3: Implement**, including the messages. If `record-service.ts` passes ~200 lines, move the photo and listing assembly into a `record-extras.ts` helper in the same module.
- [ ] **Step 4: Run** the int tests, `bun run test:e2e src/routes/(admin)/members`, `bun run check` and `bun run lint` → PASS.
- [ ] **Step 5: Commit** `feat(member): photos and directory listing on staff screens`
