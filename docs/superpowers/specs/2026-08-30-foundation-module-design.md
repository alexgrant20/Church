# Foundation Module Design

## Context

This is a new church management application ("ChurchApp") covering scheduling,
member registration, worship/check-in, services (prayer, funeral), events
(concerts, katekisasi, pranikah, retreat), serving-team scheduling, finance,
and a library — plus WA/Email and Instagram integrations. The feature list
spans roughly ten largely-independent subsystems, too much for one spec, so
the project is being decomposed into sub-projects built in order, each with
its own spec → plan → implementation cycle.

This document specs the **first sub-project: Foundation** — auth/session,
role management, Gereja/Cabang (branch) CRUD, Pendeta assignment, audit
logging, and multi-branch data isolation. Every later module depends on it,
so getting its access-control and audit plumbing right matters more here
than anywhere else in the codebase.

Expected scale: 20,000+ registered users, not concurrent. This does not
require a distributed-systems architecture; a single well-organized Postgres
+ single app-server deployment is sufficient.

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
`lib/server/modules/<domain>/`, organized per subsystem (`auth`, `cabang`,
`pendeta`, `audit`, and later `membership`, `ibadah`, `finance`, etc.). These
modules are framework-agnostic (no SvelteKit-specific imports), which keeps
them unit-testable in isolation and keeps a future extraction to a separate
API mechanical rather than a rewrite.

**Module build order** (for reference; only Foundation is designed in this
document):

| # | Module | Scope | Depends on |
|---|--------|-------|-------------|
| 1 | Foundation | Auth/session, roles, Gereja/Cabang CRUD, Pendeta assignment, audit_logs, cabang-scoping | — |
| 2 | Pendaftaran Jemaat | Member registration, family data, birth/death records | Foundation |
| 3 | Ibadah | Bulk check-in, warta, ringkasan, kelompok, persekutuan | Foundation, Jemaat |
| 4 | Service | Prayer service, funeral service | Foundation, Jemaat |
| 5 | Event | Registration flows (concert, katekisasi, pranikah, retreat), incl. no-registration events | Foundation, Jemaat |
| 6 | Pelayanan | Choir/usher/kolektan scheduling | Foundation, Jemaat |
| 7 | Keuangan | Offerings, tithe, donations, financial mgmt, payroll | Foundation, Jemaat |
| 8 | Perpustakaan | Buy/sell, borrow, donate | Foundation, Jemaat |
| 9 | Jadwal & Integrations | WA/Email/Message, IG — likely folds into notifications used by Ibadah/Event rather than standing alone | Foundation |

## Foundation: project structure

```
src/
  lib/
    server/
      db/
        schema/            drizzle schema, one file per domain
          auth.ts             users, sessions
          cabang.ts           cabang, kelompok (stub)
          roles.ts            role_assignments
          audit.ts            audit_logs
        client.ts           drizzle instance (casing: 'snake_case')
      context.ts           AsyncLocalStorage request context
      errors.ts            domain error classes (NotFoundError, ForbiddenError, ValidationError)
      modules/
        auth/     { service.ts, repository.ts, schema.ts (zod) }
        cabang/   { service.ts, repository.ts, schema.ts }
        pendeta/  { service.ts, repository.ts, schema.ts }
        audit/    { service.ts }              <- recordAudit()
    components/            shared UI
  routes/
    +hooks.server.ts        loads session -> locals, seeds AsyncLocalStorage
    login/
    (admin)/
      +layout.server.ts     guard: staff roles only
      cabang/  users/  dashboard/...
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
compromised Admin Cabang account immediately rather than waiting out a
token's expiry.

Password hashing uses `oslo` (scrypt-based, no native bindings), so it
doesn't constrain the Node-vs-Bun runtime choice for deployment.

## Roles & cabang-scoping

Rather than a plain `role` column on `users`, roles and their scope live in
one join table:

```
role_assignments: id, user_id, role (enum), cabang_id (nullable FK), kelompok_id (nullable FK), assigned_at
```

- **Superadmin** — `role=superadmin`, no scope (global access).
- **Pendeta** — one row per assigned cabang (`cabang_id=X`). Supports
  multi-cabang Penugasan without a schema change.
- **Admin Cabang** — `role=admin_cabang`, `cabang_id=X`.
- **Admin Kelompok** — `role=admin_kelompok`, `kelompok_id=X`.
- **Anggota** — `role=anggota`, `cabang_id=` their home cabang.

A single user can hold multiple rows (e.g., a Pendeta who is also an Admin
Cabang somewhere) with no schema change.

`kelompok` (small groups) is conceptually owned by the future Ibadah module,
but Foundation creates a **minimal stub table** (`id, cabang_id, name`) so
`role_assignments.kelompok_id` has a valid FK target. Ibadah extends this
table later rather than Foundation blocking on it or using an unconstrained
plain UUID.

**Enforcement is centralized once.** At request time, `hooks.server.ts`
loads the session user's `role_assignments` into the AsyncLocalStorage
request context. Every module's repository layer calls one shared helper,
`getAccessibleCabangIds(ctx)`, which returns `"all"` for Superadmin or a
concrete list of cabang IDs otherwise, and filters
`WHERE cabang_id IN (...)` accordingly. This is the single place
cabang-isolation logic lives, so no module can silently omit it in a new
query.

## Audit logging

Application-level (not DB-trigger-based), so log entries capture semantic
actions ("bulk check-in of 50 jemaat for service X"), not just raw column
diffs — the DB-trigger approach is deferred and can be added later for
specific highly-sensitive tables (e.g. Keuangan) as defense-in-depth if
ever needed.

```
audit_logs: id, actor_user_id, action, entity_type, entity_id, cabang_id, diff (jsonb), metadata (jsonb), created_at
```

Indexed on `(entity_type, entity_id)` and `(actor_user_id, created_at)` —
the two queries this table actually needs to serve: "history of this
record" and "what did this admin do."

Mechanics:
- Request context (`userId`, `role assignments`, `ip`) is carried through
  the call stack via `AsyncLocalStorage`, set once in `hooks.server.ts`.
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
| `cabang` | branch CRUD |
| `kelompok` | stub, extended by the Ibadah module |
| `role_assignments` | role + scope (cabang/kelompok); supports multi-role and Pendeta penugasan |
| `audit_logs` | actor_user_id, action, entity_type/id, cabang_id, diff (jsonb), metadata (jsonb) |

## Code conventions

- **Repository pattern**: Drizzle queries only live in each module's
  `repository.ts`; services never query `db` directly. Keeps
  cabang-scoping filters in one place per module and keeps services
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
  in particular, cabang-scoping enforcement and audit-log writes.
- **E2E tests** (Playwright) on critical flows: login, and (once later
  modules land) bulk check-in, event registration, offering entry.
- Tests are co-located as `*.test.ts` next to the service they cover, with
  small factory functions for building test users/cabang/role-assignments
  to avoid copy-pasted setup.

## Out of scope for this document

- Detailed schema/flows for Pendaftaran Jemaat, Ibadah, Service, Event,
  Pelayanan, Keuangan, Perpustakaan, and Jadwal & Integrations — each gets
  its own spec when its turn comes in the build order above.
- The full `kelompok` feature set (belongs to the Ibadah module; Foundation
  only creates the minimal stub table it needs as an FK target).
- DB-trigger-based audit logging for sensitive tables — noted as a
  possible future addition, not designed here.
