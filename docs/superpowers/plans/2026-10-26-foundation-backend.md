# Foundation Backend (Database) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Foundation v1 schema (`users`) with the approved v2 schema (people, households, accounts, attachments), with migrations, integration tests, and seed data, keeping the app compiling and login working.

**Architecture:** Drizzle schema files per domain under `src/lib/server/db/schema/`. One migration generated from scratch (no live data). Integration tests run against the test Postgres in their own Vitest project. Registration, OTP, activation, acting-for, and `canViewPerson()` services are **not** in this plan; they get their own plan once this schema lands.

**Tech Stack:** Bun, SvelteKit 2, Drizzle ORM 0.45 + drizzle-kit 0.31, postgres-js, Postgres 18, zod 4, Vitest 4.

**Spec:** `docs/superpowers/specs/2026-10-26-foundation-database-design.md`

## Global Constraints

- Primary keys: `uuid` default `uuidv7()` (Postgres 18), except `sessions.id` (char(64) hash), `accounts.person_id`, `login_throttles.identifier_hash`, `member_code_counters (branch_id, year)`.
- Timestamps `timestamptz`; Drizzle `casing: 'snake_case'`; never map names by hand.
- Soft delete only: `deleted_at` on `branches`, `groups`, `households`, `people`, `person_relationships`, `role_assignments`, `registration_links`, `attachments`. Unique indexes on them are partial `where deleted_at is null`. Foreign keys `restrict`.
- Hard-deleted tables: `sessions`, `otp_codes`, `login_throttles`, `error_logs`.
- NIK: `nik_encrypted` bytea (AES-256-GCM) + `nik_hash` char(64) (HMAC-SHA-256). Never in list selects, audit diffs, or logs.
- Code, identifiers, comments English only. Functions under ~40 lines, files under ~200 lines.
- Repositories are the only code touching `db` / `tx`.

## Review Focus

1. Login with a differently-cased email (`Budi@Mail.com`) must find the account stored as `budi@mail.com`. Test in Task 5.
2. Two registrations in the same branch and year at the same moment must get different Member IDs. Test in Task 4.
3. A soft-deleted row must not block a new row with the same unique value (branch code, profile photo). Tests in Tasks 3 and 6.
4. An account that exists but is not activated (`password_hash` null) must fail login with the same "Invalid credentials", not crash. Test in Task 5.
5. The same NIK typed with spaces or dashes (`3174 0123 4567 0001`) must produce the same `nik_hash`. Test in Task 2.

---

## File Map

| File | Responsibility |
| --- | --- |
| `docker-compose.yml` | Postgres 18, builtin `C.UTF-8` locale |
| `.env.example`, `.env.test` | env names; committed test-only keys and test DB URL |
| `vite.config.ts` | new `integration` Vitest project |
| `src/lib/server/db/migrate.ts` | `runMigrations(url)`: creates `pg_trgm`, runs Drizzle migrator |
| `scripts/migrate.ts` | CLI wrapper for `db:migrate` |
| `src/lib/server/db/test/global-setup.ts` | fresh test schema + migrations once per run |
| `src/lib/server/db/test/reset.ts` | `resetDb()` truncates every table |
| `src/lib/server/db/test/factories.ts` | test row builders, grown per task |
| `src/lib/server/crypto.ts` | NIK normalize / encrypt / decrypt / mask, `keyedHash()` |
| `src/lib/server/db/schema/columns.ts` | shared column builders |
| `src/lib/server/db/schema/location.ts` | `countries`, `regions`, `cities` |
| `src/lib/server/db/schema/branch.ts` | `branches`, `groups` |
| `src/lib/server/db/schema/people.ts` | `households`, `people`, `personRelationships`, `memberCodeCounters` |
| `src/lib/server/db/schema/auth.ts` | `accounts`, `loginThrottles`, `otpCodes`, `sessions`, `registrationLinks` |
| `src/lib/server/db/schema/roles.ts` | `roleAssignments` |
| `src/lib/server/db/schema/system.ts` | `systemSettings`, `errorLogs` |
| `src/lib/server/db/schema/attachment.ts` | `attachments` |
| `src/lib/server/db/schema/audit.ts` | `auditLogs` |
| `src/lib/server/modules/people/member-code.ts` | `nextMemberCode()` |
| `src/lib/server/modules/registration/repository.ts` | `claimRegistrationLink()` |
| `scripts/seed/*.ts` | location import and dev data |

Integration tests are named `*.int.test.ts` and sit next to the code they cover.

---

### Task 1: Postgres 18 and the integration test harness

**Files:**
- Modify: `docker-compose.yml`, `.env.example`, `vite.config.ts`, `package.json`, `CLAUDE.md` (Commands block)
- Create: `.env.test`, `src/lib/server/db/migrate.ts`, `scripts/migrate.ts`, `src/lib/server/db/test/global-setup.ts`, `src/lib/server/db/test/reset.ts`, `src/lib/server/db/schema/columns.ts`
- Test: `src/lib/server/db/harness.int.test.ts`

**Interfaces:**
- Produces: `runMigrations(url: string): Promise<void>`; `resetDb(): Promise<void>`; column builders `id()`, `createdAt()`, `updatedAt()`, `deletedAt()` from `schema/columns.ts`.

- [ ] **Step 1: Move both compose services to Postgres 18**

Image `postgres:18-alpine`. Add `POSTGRES_INITDB_ARGS: '--locale-provider=builtin --builtin-locale=C.UTF-8'` to both. Dev volume mounts at `/var/lib/postgresql` (not `/data`); test `tmpfs` at `/var/lib/postgresql`. Keep ports 55432 / 55433 and the comment above them.

Run: `docker compose down -v && docker compose up -d && docker compose exec postgres psql -U churchapp -d churchapp_dev -c "select uuidv7()"`
Expected: one UUID whose 15th character is `7`.

- [ ] **Step 2: Write `.env.test` and extend `.env.example`**

`.env.test` (committed, test-only values): `DATABASE_URL` = the test URL on port 55433, `NIK_ENCRYPTION_KEY` and `HMAC_KEY` = fixed base64 of 32 bytes each. `.env.example` gains `NIK_ENCRYPTION_KEY=` and `HMAC_KEY=` with a comment: `openssl rand -base64 32`.

- [ ] **Step 3: Write the failing harness test**

```ts
// src/lib/server/db/harness.int.test.ts
import { describe, it, expect } from 'vitest';
import { sql } from 'drizzle-orm';
import { db } from '$lib/server/db/client';

describe('test database', () => {
	it('is the test database, not dev', async () => {
		const [row] = await db.execute<{ name: string }>(sql`select current_database() as name`);
		expect(row.name).toBe('churchapp_test');
	});

	it('has pg_trgm installed', async () => {
		const rows = await db.execute(sql`select 1 from pg_extension where extname = 'pg_trgm'`);
		expect(rows.length).toBe(1);
	});
});
```

- [ ] **Step 4: Add the `integration` Vitest project and scripts**

In `vite.config.ts`: a third project `integration`, `environment: 'node'`, `include: ['src/**/*.int.test.ts']`, `fileParallelism: false`, `globalSetup: ['src/lib/server/db/test/global-setup.ts']`, `env: loadEnv('test', process.cwd(), '')`. Exclude `*.int.test.ts` from the `server` project. `package.json`: `"test:int": "vitest --project integration --run"`, `"db:migrate": "bun scripts/migrate.ts"`. Add `test:int` and `db:seed` lines to the CLAUDE.md Commands block.

Run: `bun run test:int`
Expected: FAIL (global setup file missing).

- [ ] **Step 5: Implement `runMigrations`, the CLI, global setup, and `resetDb`**

- `runMigrations(url)` opens its own `postgres(url, { max: 1 })`, runs `create extension if not exists pg_trgm`, then `migrate(drizzle(client), { migrationsFolder: 'drizzle' })`, then closes. It must not import `$lib/server/config` (the CLI and global setup run outside SvelteKit).
- `scripts/migrate.ts` calls `runMigrations(process.env.DATABASE_URL!)`.
- Global setup reads `DATABASE_URL` from `loadEnv('test', ...)`, refuses to run unless the database name ends in `_test`, runs `drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;`, then `runMigrations`.
- `resetDb()` truncates every table in `public` in one `truncate ... restart identity cascade` statement built from `pg_tables`.

- [ ] **Step 6: Write `schema/columns.ts`**

`id()` = `uuid().primaryKey().default(sql\`uuidv7()\`)`; `createdAt()` = `timestamp({ withTimezone: true }).notNull().defaultNow()`; `updatedAt()` same plus `.$onUpdate(() => new Date())`; `deletedAt()` = nullable `timestamp({ withTimezone: true })`.

- [ ] **Step 7: Run the harness test**

Run: `bun run test:int`
Expected: PASS, 2 tests.

- [ ] **Step 8: Commit**

```bash
git add docker-compose.yml .env.example .env.test vite.config.ts package.json CLAUDE.md scripts/migrate.ts src/lib/server/db
git commit -m "build: Postgres 18 and integration test harness"
```

---

### Task 2: NIK crypto and keyed hashing

**Files:**
- Modify: `src/lib/server/config.ts`
- Create: `src/lib/server/crypto.ts`
- Test: `src/lib/server/crypto.test.ts`

**Interfaces:**
- Consumes: `config.NIK_ENCRYPTION_KEY`, `config.HMAC_KEY` (base64, each decoding to 32 bytes; zod rejects anything else at startup).
- Produces:
  - `normalizeNik(input: string): string` (strips non-digits; throws `ValidationError('nik.invalid')` unless exactly 16 digits remain)
  - `encryptNik(nik: string): Buffer` (AES-256-GCM, layout `iv(12) | tag(16) | ciphertext`, fresh IV per call)
  - `decryptNik(data: Buffer): string`
  - `maskNik(nik: string): string` (first 4 + 8 × `•` + last 4)
  - `keyedHash(value: string): string` (HMAC-SHA-256 hex, 64 chars; used for `nik_hash`, OTP codes, login throttle identifiers)

- [ ] **Step 1: Write the failing tests**

```ts
describe('NIK crypto', () => {
	const nik = '3174012345670001';

	it('normalizes spaces and dashes to the same NIK', () => {
		expect(normalizeNik('3174 0123-4567 0001')).toBe(nik);
	});
	it('rejects a NIK that is not 16 digits', () => {
		expect(() => normalizeNik('31740123')).toThrow('nik.invalid');
	});
	it('round-trips through encryption', () => {
		expect(decryptNik(encryptNik(nik))).toBe(nik);
	});
	it('uses a fresh IV, so the same NIK encrypts differently', () => {
		expect(encryptNik(nik).equals(encryptNik(nik))).toBe(false);
	});
	it('fails to decrypt tampered data', () => {
		const data = encryptNik(nik);
		data[data.length - 1] ^= 1;
		expect(() => decryptNik(data)).toThrow();
	});
	it('masks all but the first and last 4 digits', () => {
		expect(maskNik(nik)).toBe('3174••••••••0001');
	});
	it('hashes the same NIK typed differently to the same value', () => {
		expect(keyedHash(normalizeNik('3174 0123 4567 0001'))).toBe(keyedHash(nik));
		expect(keyedHash(nik)).toMatch(/^[0-9a-f]{64}$/);
	});
});
```

- [ ] **Step 2: Run to see it fail**

Run: `bun run test:unit -- --run src/lib/server/crypto.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Add the two keys to `config.ts` and implement `crypto.ts`** with `node:crypto` (`createCipheriv('aes-256-gcm')`, `createHmac('sha256')`).

- [ ] **Step 4: Run the tests**

Run: `bun run test:unit -- --run src/lib/server/crypto.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/config.ts src/lib/server/crypto.ts src/lib/server/crypto.test.ts
git commit -m "feat(crypto): NIK encryption and keyed hashing"
```

---

### Task 3: Location reference data, branches, groups

**Files:**
- Create: `src/lib/server/db/schema/location.ts`, `src/lib/server/db/test/factories.ts`
- Modify: `src/lib/server/db/schema/branch.ts`, `schema/index.ts`, `modules/branch/schema.ts`, `modules/branch/repository.ts`, `modules/branch/service.ts`, `modules/branch/service.test.ts`, `routes/(admin)/branches/+page.server.ts`, `routes/(admin)/branches/+page.svelte`
- Delete: `drizzle/` (regenerated from scratch in this task and every later schema task)
- Test: `src/lib/server/db/schema/branch.int.test.ts`

**Interfaces:**
- Consumes: column builders (Task 1).
- Produces:
  - tables `countries`, `regions`, `cities`, `branches`, `groups` exactly as the spec's tables section
  - `createBranchSchema`: `{ code: /^[A-Z]{2,8}$/, name: 1–255, addressLine: 1–500, postalCode: ≤10 | null, cityId: uuid, timezone: string in Intl.supportedValuesOf('timeZone') }`
  - factories `makeCity(): Promise<{ id: string }>` (creates its own country and region) and `makeBranch(overrides?: Partial<NewBranch>): Promise<Branch>` (unique random `code`)

- [ ] **Step 1: Write the failing integration tests**

```ts
describe('branches', () => {
	beforeEach(resetDb);

	it('rejects a duplicate live branch code', async () => {
		await makeBranch({ code: 'JKT' });
		await expect(makeBranch({ code: 'JKT' })).rejects.toThrow(/unique/);
	});
	it('allows reusing the code of a soft-deleted branch', async () => {
		const old = await makeBranch({ code: 'JKT' });
		await db.update(branches).set({ deletedAt: new Date() }).where(eq(branches.id, old.id));
		await expect(makeBranch({ code: 'JKT' })).resolves.toBeDefined();
	});
	it('gives new rows UUID v7 ids', async () => {
		const branch = await makeBranch();
		expect(branch.id[14]).toBe('7');
	});
});
```

Also update `service.test.ts` with schema cases: a valid payload passes; `code: 'jkt'` fails; `timezone: 'Mars/Base'` fails.

- [ ] **Step 2: Run to see them fail**

Run: `bun run test:int -- src/lib/server/db/schema/branch.int.test.ts`
Expected: FAIL (`makeBranch` not exported).

- [ ] **Step 3: Write `location.ts` and the new `branch.ts`, then regenerate the migration**

Uniques and indexes from the spec, including the `gin_trgm_ops` index on `cities.name` (`index().using('gin', sql\`${t.name} gin_trgm_ops\`)`). `branches.code` unique `where deleted_at is null`.

Run: `rm -rf drizzle && bun run db:generate`
Expected: one new `drizzle/0000_*.sql` containing `create table "branches"` with `"city_id" uuid not null`.

- [ ] **Step 4: Update the branch module and page**

Repository, service and zod schema use the new columns. `listAccessibleBranches` adds `isNull(branches.deletedAt)` and selects only `id, code, name`. The page keeps its list (showing `code` and `name`) and drops the create form: a branch now needs a city picker, which the frontend plan builds. The `default` action and its form are removed.

- [ ] **Step 5: Run the tests and the type check**

Run: `bun run test:int -- src/lib/server/db/schema/branch.int.test.ts && bun run test:unit -- --run && bun run check`
Expected: all PASS, 0 type errors.

- [ ] **Step 6: Commit**

```bash
git add drizzle src/lib/server src/routes/\(admin\)/branches
git commit -m "feat(db): location reference tables and v2 branches"
```

---

### Task 4: People, households, family tree, Member IDs

**Files:**
- Create: `src/lib/server/db/schema/people.ts`, `src/lib/server/modules/people/member-code.ts`
- Modify: `schema/index.ts`, `db/test/factories.ts`
- Test: `src/lib/server/modules/people/people.int.test.ts`

**Interfaces:**
- Consumes: `branches`, `cities`, `makeBranch`, `makeCity` (Task 3); `keyedHash`, `encryptNik` (Task 2).
- Produces:
  - tables `households`, `people`, `personRelationships`, `memberCodeCounters`; enums `sex` (`male`, `female`), `relationship_kind` (`parent`, `spouse`)
  - `nextMemberCode(tx: Transaction, branch: { id: string; code: string }, year: number): Promise<string>`, returning `JKT-2026-00042` (5 digits, zero-padded), using one `insert ... on conflict (branch_id, year) do update set last_number = member_code_counters.last_number + 1 returning last_number`. Imports only schema and `import type { Transaction }`, so the seed script can use it.
  - factories `makeHousehold()` and `makePerson(overrides?: Partial<NewPerson>): Promise<Person>`

- [ ] **Step 1: Write the failing tests**

```ts
describe('people', () => {
	beforeEach(resetDb);

	it('numbers Member IDs per branch and year', async () => {
		const branch = await makeBranch({ code: 'JKT' });
		const codes = await db.transaction(async (tx) => [
			await nextMemberCode(tx, branch, 2026),
			await nextMemberCode(tx, branch, 2026)
		]);
		expect(codes).toEqual(['JKT-2026-00001', 'JKT-2026-00002']);
	});
	it('never hands out the same Member ID to concurrent registrations', async () => {
		const branch = await makeBranch();
		const codes = await Promise.all(
			Array.from({ length: 10 }, () => db.transaction((tx) => nextMemberCode(tx, branch, 2026)))
		);
		expect(new Set(codes).size).toBe(10);
	});
	it('rejects a second live person with the same NIK hash', async () => {
		const nikHash = keyedHash('3174012345670001');
		await makePerson({ nikHash });
		await expect(makePerson({ nikHash })).rejects.toThrow(/unique/);
	});
	it('allows many people without a NIK', async () => {
		await makePerson({ nikHash: null });
		await expect(makePerson({ nikHash: null })).resolves.toBeDefined();
	});
	it('rejects a relationship of a person to themselves', async () => {
		const p = await makePerson();
		await expect(
			db.insert(personRelationships).values({ kind: 'parent', personId: p.id, relatedPersonId: p.id })
		).rejects.toThrow(/check/);
	});
	it('stores a couple once, lower id first', async () => {
		const [a, b] = [await makePerson(), await makePerson()].sort((x, y) => (x.id < y.id ? -1 : 1));
		await expect(
			db.insert(personRelationships).values({ kind: 'spouse', personId: b.id, relatedPersonId: a.id })
		).rejects.toThrow(/check/);
	});
	it('finds a person by part of their Chinese name', async () => {
		await makePerson({ chineseName: '王美玲' });
		const rows = await db.select().from(people).where(ilike(people.chineseName, '%美玲%'));
		expect(rows).toHaveLength(1);
	});
});
```

- [ ] **Step 2: Run to see them fail**

Run: `bun run test:int -- src/lib/server/modules/people`
Expected: FAIL (`people` not exported).

- [ ] **Step 3: Write `people.ts` as the spec's tables section, then regenerate**

Checks: `person_id <> related_person_id`; `kind <> 'spouse' or person_id < related_person_id`; `nik_hash ~ '^[0-9a-f]{64}$'`. Trigram GIN indexes on `full_name`, `nickname`, `chinese_name`.

Run: `rm -rf drizzle && bun run db:generate`
Expected: migration contains `create table "people"` and `gin_trgm_ops`.

- [ ] **Step 4: Implement `nextMemberCode` and the factories**

- [ ] **Step 5: Run the tests**

Run: `bun run test:int -- src/lib/server/modules/people && bun run check`
Expected: PASS, 7 tests; 0 type errors.

- [ ] **Step 6: Commit**

```bash
git add drizzle src/lib/server
git commit -m "feat(db): people, households, family tree, Member IDs"
```

---

### Task 5: Accounts and sessions replace `users`

The biggest task: it removes `users` and rewires every caller in one commit, so the app compiles and login keeps working.

**Files:**
- Modify: `schema/auth.ts` (rewrite), `schema/roles.ts`, `schema/audit.ts`, `schema/index.ts`, `server/context.ts`, `src/app.d.ts`, `src/hooks.server.ts`, `modules/auth/repository.ts`, `modules/auth/service.ts`, `modules/audit/service.ts`, `modules/pastor/*.ts`, `routes/(admin)/+layout.server.ts`, `routes/(member)/+layout.server.ts`, `routes/(member)/profile/+page.svelte`, `db/test/factories.ts`
- Create: `src/lib/server/modules/registration/repository.ts`
- Test: `src/lib/server/modules/auth/auth.int.test.ts`, `src/lib/server/modules/registration/registration.int.test.ts`

**Interfaces:**
- Consumes: `people`, `households`, `makePerson` (Task 4); `hashPassword` (existing).
- Produces:
  - tables `accounts`, `loginThrottles`, `otpCodes`, `sessions`, `registrationLinks` as the spec; enums `account_status`, `otp_purpose`, `otp_channel`. `accounts.email` partial unique on `lower(email)`.
  - `RequestContext = { personId: string | null; actingAsPersonId: string | null; roleAssignments: RoleAssignment[]; ip: string }`; `RoleAssignment.role` is `'superadmin' | 'pastor' | 'branch_admin' | 'group_admin'` (no `member`)
  - `App.Locals = { person: { id: string; fullName: string } | null; actingAsPersonId: string | null; roleAssignments: RoleAssignment[] }`
  - `findAccountByIdentifier(identifier: string): Promise<{ personId: string; passwordHash: string | null; status: 'active' | 'suspended' } | null>`: an identifier with `@` matches `lower(email) = lower($1)`, otherwise `phone = $1`. Joins `people` and excludes soft-deleted people.
  - `login()` throws `ValidationError('Invalid credentials')` when the account is missing, suspended, or has a null `passwordHash`
  - `validateSessionToken(token): Promise<{ person: { id; fullName } | null; actingAsPersonId: string | null; roleAssignments: RoleAssignment[] }>`
  - `recordAudit` input field `actorPersonId?: string | null`; it writes `onBehalfOfPersonId: ctx?.actingAsPersonId ?? null`
  - `claimRegistrationLink(tx: Transaction, tokenHash: string, householdId: string): Promise<{ id: string; branchId: string } | null>`, the single `update ... where used_at is null and revoked_at is null and deleted_at is null returning` from the spec
  - factory `makeAccount(personId, overrides?)` storing a real `hashPassword('correct-horse')`

- [ ] **Step 1: Write the failing tests**

```ts
describe('login', () => {
	beforeEach(resetDb);

	it('finds an account by email in any letter case', async () => {
		const p = await makePerson();
		await makeAccount(p.id, { email: 'budi@mail.com' });
		expect((await findAccountByIdentifier('Budi@Mail.com'))?.personId).toBe(p.id);
	});
	it('gives the same error for an unknown user and an unactivated account', async () => {
		const p = await makePerson();
		await makeAccount(p.id, { email: 'sari@mail.com', passwordHash: null });
		const ip = { ip: '127.0.0.1' };
		await expect(login({ identifier: 'sari@mail.com', password: 'whatever1' }, ip)).rejects.toThrow('Invalid credentials');
		await expect(login({ identifier: 'nobody@mail.com', password: 'whatever1' }, ip)).rejects.toThrow('Invalid credentials');
	});
	it('rejects a suspended account', async () => {
		const p = await makePerson();
		await makeAccount(p.id, { email: 'a@mail.com', status: 'suspended' });
		await expect(login({ identifier: 'a@mail.com', password: 'correct-horse' }, { ip: '1' })).rejects.toThrow('Invalid credentials');
	});
	it('logs in, creates a session, and writes the audit row with the person as actor', async () => {
		const p = await makePerson();
		await makeAccount(p.id, { email: 'b@mail.com' });
		const { token } = await login({ identifier: 'b@mail.com', password: 'correct-horse' }, { ip: '1' });
		expect((await validateSessionToken(token)).person?.id).toBe(p.id);
		const [audit] = await db.select().from(auditLogs);
		expect(audit.actorPersonId).toBe(p.id);
		expect(audit.onBehalfOfPersonId).toBeNull();
	});
	it('rejects an account with neither email nor phone', async () => {
		const p = await makePerson();
		await expect(makeAccount(p.id, { email: null, phone: null })).rejects.toThrow(/check/);
	});
});

describe('registration links', () => {
	beforeEach(resetDb);

	it('can be claimed only once', async () => {
		const link = await makeRegistrationLink();
		const [h1, h2] = [await makeHousehold(), await makeHousehold()];
		expect(await db.transaction((tx) => claimRegistrationLink(tx, link.tokenHash, h1.id))).not.toBeNull();
		expect(await db.transaction((tx) => claimRegistrationLink(tx, link.tokenHash, h2.id))).toBeNull();
	});
	it('cannot be claimed after revocation', async () => {
		const link = await makeRegistrationLink({ revokedAt: new Date() });
		const h = await makeHousehold();
		expect(await db.transaction((tx) => claimRegistrationLink(tx, link.tokenHash, h.id))).toBeNull();
	});
});
```

`makeRegistrationLink(overrides?)` is added to the factories in this task (creates its branch and staff person).

- [ ] **Step 2: Run to see them fail**

Run: `bun run test:int -- src/lib/server/modules/auth src/lib/server/modules/registration`
Expected: FAIL (`accounts` / `claimRegistrationLink` not exported).

- [ ] **Step 3: Rewrite `schema/auth.ts`; rename `user_id` to `person_id` in `roles.ts`; `actor_user_id` to `actor_person_id` plus `on_behalf_of_person_id` in `audit.ts`; regenerate**

Run: `rm -rf drizzle && bun run db:generate && grep -c '"users"' drizzle/0000_*.sql`
Expected: `0` (no `users` table left).

- [ ] **Step 4: Rewire the callers listed under Files to the new names and types**

The profile page shows `data.person.fullName`. Layouts return `person` instead of `user`. `pastor` schema field becomes `personId`.

- [ ] **Step 5: Run every check**

Run: `bun run test:int && bun run test:unit -- --run && bun run check && bun run lint`
Expected: all PASS; `grep -rn "userId\|users\b" src/` prints nothing.

- [ ] **Step 6: Commit**

```bash
git add drizzle src
git commit -m "feat(db): accounts, sessions, registration links replace users"
```

---

### Task 6: Role rules, settings, attachments, error log

**Files:**
- Create: `src/lib/server/db/schema/system.ts`, `src/lib/server/db/schema/attachment.ts`
- Modify: `schema/roles.ts`, `schema/audit.ts`, `schema/index.ts`, `db/test/factories.ts`
- Test: `src/lib/server/db/schema/rules.int.test.ts`

**Interfaces:**
- Consumes: `makePerson`, `makeBranch` (Tasks 3–4).
- Produces: tables `systemSettings` (with `id`), `errorLogs`, `attachments`; enums `attachment_owner` (`person`, `branch`) and `attachment_purpose` (`profile_photo`, `church_photo`); role scope checks; audit index `(branch_id, created_at)`; factory `makeAttachment(overrides?)`.

- [ ] **Step 1: Write the failing tests**

```ts
describe('schema rules', () => {
	beforeEach(resetDb);

	it('rejects a superadmin role with a branch', async () => {
		const [p, b] = [await makePerson(), await makeBranch()];
		await expect(db.insert(roleAssignments).values({ personId: p.id, role: 'superadmin', branchId: b.id })).rejects.toThrow(/check/);
	});
	it('rejects a group_admin role without a group', async () => {
		const p = await makePerson();
		await expect(db.insert(roleAssignments).values({ personId: p.id, role: 'group_admin' })).rejects.toThrow(/check/);
	});
	it('rejects the same superadmin role twice', async () => {
		const p = await makePerson();
		await db.insert(roleAssignments).values({ personId: p.id, role: 'superadmin' });
		await expect(db.insert(roleAssignments).values({ personId: p.id, role: 'superadmin' })).rejects.toThrow(/unique/);
	});
	it('allows one live profile photo per person, and a new one after soft delete', async () => {
		const p = await makePerson();
		const first = await makeAttachment({ ownerType: 'person', ownerId: p.id, purpose: 'profile_photo' });
		await expect(makeAttachment({ ownerType: 'person', ownerId: p.id, purpose: 'profile_photo', position: 1 })).rejects.toThrow(/unique/);
		await db.update(attachments).set({ deletedAt: new Date() }).where(eq(attachments.id, first.id));
		await expect(makeAttachment({ ownerType: 'person', ownerId: p.id, purpose: 'profile_photo' })).resolves.toBeDefined();
	});
	it('allows many church photos per branch in order', async () => {
		const b = await makeBranch();
		await makeAttachment({ ownerType: 'branch', ownerId: b.id, purpose: 'church_photo', position: 0 });
		await expect(makeAttachment({ ownerType: 'branch', ownerId: b.id, purpose: 'church_photo', position: 1 })).resolves.toBeDefined();
	});
});
```

- [ ] **Step 2: Run to see them fail**

Run: `bun run test:int -- src/lib/server/db/schema/rules.int.test.ts`
Expected: FAIL (`attachments` not exported).

- [ ] **Step 3: Write the schema, then regenerate**

Role uniqueness: unique index on `(person_id, role, coalesce(branch_id, '00000000-0000-0000-0000-000000000000'), coalesce(group_id, '00000000-0000-0000-0000-000000000000')) where deleted_at is null`; the `coalesce` stands in for `nulls not distinct`, which Drizzle's partial index builder cannot express. Attachment uniques are partial `where deleted_at is null`. `content_type` check against the spec's allow list.

Run: `rm -rf drizzle && bun run db:generate`
Expected: migration contains `create table "attachments"` and `create table "error_logs"`.

- [ ] **Step 4: Run the tests**

Run: `bun run test:int && bun run check`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add drizzle src/lib/server
git commit -m "feat(db): role rules, settings, attachments, error log"
```

---

### Task 7: Seed data

**Files:**
- Create: `scripts/seed/index.ts`, `scripts/seed/locations.ts`, `scripts/seed/dev-data.ts`, `scripts/seed/SOURCES.md`
- Modify: `package.json` (`"db:seed": "bun scripts/seed/index.ts"`), `.gitignore` (`.seed-cache/`)
- Test: `scripts/seed/locations.test.ts` (parsers only)

**Interfaces:**
- Consumes: schema tables (Tasks 3–6), `nextMemberCode` (Task 4), `hashPassword`. The seed opens its own Drizzle client from `process.env.DATABASE_URL` and never imports `$lib/server/config`.
- Produces:
  - `parseWilayahSql(sql: string): { provinces: { code: string; name: string }[]; cities: { code: string; provinceCode: string; name: string }[] }`
  - `titleCase(name: string): string` (`KOTA ADM. JAKARTA PUSAT` → `Kota Adm. Jakarta Pusat`)

- [ ] **Step 1: Pin the sources and check their licences**

- Indonesia: `cahyadsn/wilayah`, file `db/wilayah.sql`, pinned to a commit hash.
- Other countries: `dr5hn/countries-states-cities-database`, `csv/countries.csv`, `csv/states.csv`, `csv/cities.csv`, pinned to a release tag.

Write the URLs, pins and licences in `SOURCES.md`. If either licence does not allow use in this app, stop and report back.

- [ ] **Step 2: Write the failing parser tests**

```ts
it('keeps 2-digit province and 5-character city codes only', () => {
	const sql = "('31','DKI JAKARTA'),('31.71','KOTA ADM. JAKARTA PUSAT'),('31.71.01','GAMBIR')";
	expect(parseWilayahSql(sql)).toEqual({
		provinces: [{ code: '31', name: 'DKI Jakarta' }],
		cities: [{ code: '31.71', provinceCode: '31', name: 'Kota Adm. Jakarta Pusat' }]
	});
});
it('title-cases words but keeps known acronyms', () => {
	expect(titleCase('DKI JAKARTA')).toBe('DKI Jakarta');
});
```

Run: `bun run test:unit -- --run scripts/seed`
Expected: FAIL. (Add `scripts/**/*.test.ts` to the `server` project's `include`.)

- [ ] **Step 3: Implement `locations.ts`**

Downloads each pinned file into `.seed-cache/` once. Skips entirely when `countries` already has rows. Indonesia comes from wilayah; every other country from dr5hn (its `ID` rows are skipped). Inserts in batches of 1000 rows per statement, never one statement per row.

- [ ] **Step 4: Implement `dev-data.ts`** (refuses to run when `NODE_ENV=production`)

- Branches `JKT` "GRII Pusat" (Kota Adm. Jakarta Pusat) and `KG` "GRII Kelapa Gading" (Kota Adm. Jakarta Utara), both `Asia/Jakarta`.
- Superadmin: household of one, account `admin@grii.test` / `devpassword123`, activated, role `superadmin`.
- Rina: `branch_admin` of JKT, account `rina@grii.test` / `devpassword123`.
- Budi's household: Budi (JKT, account `budi@grii.test`), Sari (KG, spouse, no account), Andi (KG, born 2011, child of both, no account).
- `system_settings` row `household.adults_act_for_activated_adults` = `true`.

Every person gets a Member ID through `nextMemberCode`.

- [ ] **Step 5: Run the parser tests, then the seed on a fresh dev database**

Run: `bun run test:unit -- --run scripts/seed && bun run db:migrate && bun run db:seed`
Expected: tests PASS; the seed prints row counts (Indonesia: 38 provinces). Running `bun run db:seed` a second time adds nothing.

- [ ] **Step 6: Log in as the seeded admin**

Run `bun run dev`, sign in at `/login` with `admin@grii.test` / `devpassword123`.
Expected: redirect to `/dashboard`.

- [ ] **Step 7: Commit**

```bash
git add scripts package.json .gitignore vite.config.ts
git commit -m "feat(seed): location reference data and dev households"
```

---

## Not in this plan (next backend plan)

Registration flow, add household member, activation, login OTP and resets, login throttling logic, acting-for switch, `canViewPerson()`, the attachment registry and upload endpoint, the settings reader, error logging and the purge jobs. The tables they need all exist after Task 6.
