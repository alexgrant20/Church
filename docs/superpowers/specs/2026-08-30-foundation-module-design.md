# Foundation Module Design

## Context

This is a new church management application ("ChurchApp") covering scheduling,
member registration, worship/check-in, services (prayer, funeral), events
(concerts, catechism, premarital counseling, retreat), serving-team
scheduling, finance, and a library — plus WA/Email and Instagram
integrations. The feature list spans roughly ten largely-independent
subsystems, too much for one spec, so the project is being decomposed into
sub-projects built in order, each with its own spec → plan → implementation
cycle.

This document specs the **first sub-project: Foundation** — auth/session,
role management, branch CRUD, pastor assignment, audit logging, and
multi-branch data isolation. Every later module depends on it, so getting
its access-control and audit plumbing right matters more here than anywhere
else in the codebase.

Expected scale: 20,000+ registered users, not concurrent. This does not
require a distributed-systems architecture; a single well-organized Postgres
+ single app-server deployment is sufficient.

**Naming convention: all folders, table names, code identifiers, and role
names are strictly English**, even though the business domain and original
feature list are Indonesian. UI copy shown to end users can still be
Indonesian — that's a presentation-layer concern — but nothing in the
codebase (files, schema, variables) uses Indonesian words. The mapping below
is the single source of truth for translating the original domain terms
into the English identifiers used everywhere else in this document and in
code:

| Indonesian term | English identifier |
|---|---|
| Cabang / Gereja Cabang | `branch` |
| Jemaat / Anggota | `member` |
| Pendeta | `pastor` |
| Penugasan | `assignment` |
| Kelompok | `group` |
| Admin Kelompok | `group_admin` |
| Admin Cabang | `branch_admin` |
| Ibadah | `worship` |
| Warta | `bulletin` |
| Ringkasan | `summary` |
| Persekutuan | `fellowship` |
| Pembagian Kelompok | group assignment |
| Service Doa | prayer service |
| Service Ibadah Kematian | funeral service |
| Katekisasi | catechism |
| Pranikah | premarital (counseling) |
| Retret | retreat |
| Pelayanan | `ministry` |
| Paduan Suara | choir |
| Kolektan | offering collector |
| Keuangan | `finance` |
| Persembahan | offering |
| Perpuluhan | tithe |
| Donasi | donation |
| Gaji | payroll |
| Perpustakaan | `library` |
| Jadwal | `schedule` |
| Superadmin | `superadmin` |

## Project-wide architectural decisions

These decisions apply to the whole app, not just Foundation, and are
recorded here since Foundation establishes the patterns every later module
will follow.

**Single SvelteKit runtime, not a separate API server.** The originally
considered SvelteKit + ElysiaJS split is deferred. SvelteKit's own server
routes (`+page.server.ts` / `+server.ts`) serve as the API layer. Rationale:
there is no native mobile app (the web app doubles as the mobile experience)
and no external API consumer today, so the strongest reasons to split off a
dedicated API don't apply yet. Splitting later — if a native app, a public
API, or independent scaling needs ever arise — stays cheap because business
logic is kept out of route files (see "Modular monolith layering" below).

**One SvelteKit app for both Admin and Member views**, using route groups
(`(admin)` vs member-facing routes) rather than two separate apps. Split
into separate apps later only if their release cycles or scaling needs
genuinely diverge.

**Modular monolith layering.** Routes stay thin (parse input → call a
service function → respond). All business logic and Drizzle queries live in
`lib/server/modules/<domain>/`, organized per subsystem (`auth`, `branch`,
`pastor`, `audit`, and later `membership`, `worship`, `finance`, etc.). These
modules are framework-agnostic (no SvelteKit-specific imports), which keeps
them unit-testable in isolation and keeps a future extraction to a separate
API mechanical rather than a rewrite.

**Module build order** (for reference; only Foundation is designed in this
document):

| # | Module | Scope | Depends on |
|---|--------|-------|-------------|
| 1 | Foundation | Auth/session, roles, branch CRUD, pastor assignment, audit log, branch-scoping | — |
| 2 | Membership | Member registration, family data, birth/death records | Foundation |
| 3 | Worship | Bulk check-in, bulletin, summary, group assignment, fellowship | Foundation, Membership |
| 4 | Special Services | Prayer service, funeral service | Foundation, Membership |
| 5 | Events | Registration flows (concert, catechism, premarital counseling, retreat), incl. no-registration events | Foundation, Membership |
| 6 | Ministry | Choir/usher/offering-collector scheduling | Foundation, Membership |
| 7 | Finance | Offerings, tithe, donations, financial mgmt, payroll | Foundation, Membership |
| 8 | Library | Buy/sell, borrow, donate | Foundation, Membership |
| 9 | Schedule & Integrations | WA/Email/Message, IG — likely folds into notifications used by Worship/Events rather than standing alone | Foundation |

## Foundation: project structure

```
src/
  lib/
    server/
      db/
        schema/            drizzle schema, one file per domain
          auth.ts             users, sessions
          branch.ts           branches, groups (stub)
          roles.ts             role_assignments
          audit.ts             audit_logs
        client.ts           drizzle instance (casing: 'snake_case')
      context.ts           AsyncLocalStorage request context
      errors.ts            domain error classes (NotFoundError, ForbiddenError, ValidationError)
      modules/
        auth/     { service.ts, repository.ts, schema.ts (zod) }
        branch/   { service.ts, repository.ts, schema.ts }
        pastor/   { service.ts, repository.ts, schema.ts }
        audit/    { service.ts }              <- recordAudit()
    components/            shared UI
  routes/
    +hooks.server.ts        loads session -> locals, seeds AsyncLocalStorage
    login/
    (admin)/
      +layout.server.ts     guard: staff roles only
      branches/  users/  dashboard/...
    (member)/
      +layout.server.ts     guard: member-facing
      profile/...
```

## Auth & sessions

Roll minimal DB-backed sessions rather than depending on an auth library.
Lucia (the natural off-the-shelf pick) was sunset by its own author in favor
of exactly this pattern, since it's a small amount of code: a `sessions`
table (`id`, `user_id`, `expires_at`), a hashed opaque token in an
HTTP-only cookie, validated in `hooks.server.ts`. This is simpler than JWTs
and — importantly — instantly revocable, which matters for killing a
compromised branch-admin account immediately rather than waiting out a
token's expiry.

Password hashing uses `oslo` (scrypt-based, no native bindings), so it
doesn't constrain the Node-vs-Bun runtime choice for deployment.

## Roles & branch-scoping

Rather than a plain `role` column on `users`, roles and their scope live in
one join table:

```
role_assignments: id, user_id, role (enum), branch_id (nullable FK), group_id (nullable FK), assigned_at
```

Role enum values: `superadmin`, `pastor`, `branch_admin`, `group_admin`,
`member`.

- **superadmin** — no scope (global access).
- **pastor** — one row per assigned branch (`branch_id=X`). Supports
  multi-branch assignment without a schema change.
- **branch_admin** — `branch_id=X`.
- **group_admin** — `group_id=X`.
- **member** — `branch_id=` their home branch.

A single user can hold multiple rows (e.g., a pastor who is also a
branch_admin somewhere) with no schema change.

`groups` (small groups) is conceptually owned by the future Worship module,
but Foundation creates a **minimal stub table** (`id, branch_id, name`) so
`role_assignments.group_id` has a valid FK target. Worship extends this
table later rather than Foundation blocking on it or using an unconstrained
plain UUID.

**Enforcement is centralized once.** At request time, `hooks.server.ts`
loads the session user's `role_assignments` into the AsyncLocalStorage
request context. Every module's repository layer calls one shared helper,
`getAccessibleBranchIds(ctx)`, which returns `"all"` for `superadmin` or a
concrete list of branch IDs otherwise, and filters
`WHERE branch_id IN (...)` accordingly. This is the single place
branch-isolation logic lives, so no module can silently omit it in a new
query.

## Audit logging

Application-level (not DB-trigger-based), so log entries capture semantic
actions ("bulk check-in of 50 members for a worship service"), not just raw
column diffs — the DB-trigger approach is deferred and can be added later
for specific highly-sensitive tables (e.g. Finance) as defense-in-depth if
ever needed.

```
audit_logs: id, actor_user_id, action, entity_type, entity_id, branch_id, diff (jsonb), metadata (jsonb), created_at
```

Indexed on `(entity_type, entity_id)` and `(actor_user_id, created_at)` —
the two queries this table actually needs to serve: "history of this
record" and "what did this admin do."

Mechanics:
- Request context (`userId`, role assignments, `ip`) is carried through the
  call stack via `AsyncLocalStorage`, set once in `hooks.server.ts`.
- Mutating service functions call `recordAudit(tx, action, entityType,
  entityId, diff, metadata)` explicitly — not via an implicit
  wrapper/interceptor, since Drizzle has no query-hook mechanism to
  intercept writes transparently, and explicit calls are easier to verify
  in code review.
- The audit write happens **inside the same Drizzle transaction**
  (`db.transaction(async (tx) => {...})`) as the mutation it records, so
  they commit or roll back together.
- A `withAudit(action, entityType, fn)` helper wraps the common CRUD case
  to cut boilerplate, while keeping the call site visible.

## Schema summary

| Table | Purpose |
|---|---|
| `users` | identity: email/phone, password hash, name, status |
| `sessions` | opaque token, user_id, expires_at |
| `branches` | branch CRUD |
| `groups` | stub, extended by the Worship module |
| `role_assignments` | role + scope (branch/group); supports multi-role and pastor assignment |
| `audit_logs` | actor_user_id, action, entity_type/id, branch_id, diff (jsonb), metadata (jsonb) |

## Code conventions

- **Repository pattern**: Drizzle queries only live in each module's
  `repository.ts`; services never query `db` directly. Keeps
  branch-scoping filters in one place per module and keeps services
  mockable in tests.
- **Typed domain errors** (`NotFoundError`, `ForbiddenError`,
  `ValidationError`) thrown from services; one central mapper in routes
  converts them to SvelteKit `error()` responses — no scattered
  try/catch-and-status-code logic per route.
- **Zod schemas** colocated per module (`schema.ts`), reused for both
  form-action parsing and any JSON endpoints — one source of truth for
  validation.
- **snake_case in Postgres, camelCase in TS** via Drizzle's
  `casing: 'snake_case'` config — no manual field mapping.
- **Fail-fast config**: a single Zod-validated env/config module read at
  startup, not scattered `process.env.X` calls.

## Testing strategy

Following the same layering:
- **Unit tests** (Vitest) on service-layer functions — most business logic
  and edge cases live here, and this is where coverage matters most.
- **Integration tests** (Vitest) against a real test Postgres
  (Testcontainers or docker-compose), exercising actual Drizzle queries —
  in particular, branch-scoping enforcement and audit-log writes.
- **E2E tests** (Playwright) on critical flows: login, and (once later
  modules land) bulk check-in, event registration, offering entry.
- Tests are co-located as `*.test.ts` next to the service they cover, with
  small factory functions for building test users/branches/role-assignments
  to avoid copy-pasted setup.

## Out of scope for this document

- Detailed schema/flows for Membership, Worship, Special Services, Events,
  Ministry, Finance, Library, and Schedule & Integrations — each gets its
  own spec when its turn comes in the build order above.
- The full `groups` feature set (belongs to the Worship module; Foundation
  only creates the minimal stub table it needs as an FK target).
- DB-trigger-based audit logging for sensitive tables — noted as a
  possible future addition, not designed here.
