# CLAUDE.md

Church management system for GRII (Gereja Reformed Injili Indonesia). It is **not deployed**: there are no users or live data, so skip backward-compatibility, cache-busting, and data-migration concerns.

- Product truth (users, features, brand): `PRODUCT.md`
- Module designs: `docs/superpowers/specs/`
- Domain term mapping (Indonesian to English): `docs/superpowers/specs/2026-08-30-foundation-module-design.md`

> Foundation v2 is being reworked to match this file. Where the code and this file disagree, this file is the target.

## Stack

SvelteKit 2 + Svelte 5 (runes), TypeScript, Tailwind 4, Drizzle ORM + Postgres, zod 4, adapter-node, Bun. Installable PWA. There is no native app.

| Concern       | Choice                                                              |
| ------------- | ------------------------------------------------------------------- |
| State         | Svelte 5 runes + SvelteKit `load` / form actions. No store library. |
| Forms         | `sveltekit-superforms` + zod schema shared by client and server     |
| i18n (UI)     | Paraglide JS. Locales: `en` (base), `id`, `zh-Hans`, `zh-Hant`      |
| UI components | shadcn-svelte on Bits UI, copied into `src/lib/components/ui/`. Toasts: svelte-sonner |
| Data fetching | SvelteKit `load` + `+server.ts` JSON endpoints. No TanStack Query.  |
| Long lists    | Keyset pagination + `@tanstack/svelte-virtual`                      |

## Commands

```sh
bun run dev            # dev server
bun run check          # svelte-check (types)
bun run lint           # prettier + eslint
bun run test:unit      # vitest
bun run test:e2e       # playwright
bun run db:generate    # drizzle migration from schema
bun run db:migrate
```

Postgres runs in docker-compose on ports 55432 (dev) and 55433 (test).

## Layout

```
src/lib/server/
  config.ts              zod-validated env, read once at startup
  context.ts             AsyncLocalStorage request context (userId, roles, ip, locale)
  errors.ts              NotFoundError, ForbiddenError, ValidationError + mapErrorToHttp
  db/client.ts           drizzle instance, casing: 'snake_case'
  db/schema/<domain>.ts  one file per domain
  modules/<domain>/
    schema.ts            zod input schemas
    repository.ts        ALL Drizzle queries for the domain
    service.ts           business logic
    service.test.ts
src/routes/
  (admin)/               staff routes, guarded in +layout.server.ts
  (member)/              member routes
  login/
```

## Layers (strict)

1. **Route** (`+page.server.ts`, `+server.ts`) parses the request, calls one service function, and maps errors with `mapErrorToHttp`. It holds no logic and makes no `db` calls.
2. **Service** validates with zod, enforces business rules, and opens a transaction for writes. It does not import SvelteKit. It does not call `db.select` directly.
3. **Repository** is the only place that touches `db` / `tx`. Every query on branch-owned data filters through `getAccessibleBranchIds()`.

Services may call other modules' services, never other modules' repositories.

## Database rules

- **No N+1 queries.** Never query inside a loop or per row. Load related data with a `JOIN`, or with one `inArray()` query per list, then group the result in memory.
- **Avoid subqueries.** Prefer `JOIN`s. Use a subquery only when a join cannot express the query, and say why in a one-line comment.
- Select only the columns the caller uses on list endpoints. Do not `select()` everything.
- Use keyset (cursor) pagination, never `OFFSET`. Order by a unique key, such as `(created_at, id)`. Return `{ items, nextCursor }`. Default page size is 50, and the server enforces a maximum of 100.
- Add an index for every column used in `WHERE`, `JOIN`, or `ORDER BY` on large tables.
- Uniqueness rules are DB constraints (unique indexes), not check-then-insert code.
- Postgres uses snake_case and TypeScript uses camelCase. Drizzle maps them; never map by hand.

## Audit log

- Every mutation writes an audit row through `recordAudit(tx, ...)` **inside the same transaction**.
- `diff` holds **only the changed fields**: `{ field: { before, after } }`. Build it with the shared diff helper. Never store the full record. A create stores `after` values only.
- Never put secrets in audit rows (password hashes, OTP codes, tokens).

## Auth

- Login is an identifier (email or phone) plus password, then an OTP. Both steps are required on every login.
- OTP delivery: WhatsApp through a third-party provider, with email as the fallback.
- Password reset is verified by OTP. One reset request per user per 2 minutes.
- Failed attempts are counted per user. After `LOGIN_MAX_FAILED_ATTEMPTS` failures (env, default 5), reply "try again in 2 minutes" and block further attempts for 2 minutes. Record `last_login` on success.
- Sessions use an opaque token in an HTTP-only cookie, stored hashed in `sessions`, and can be revoked instantly.
- Never reveal whether an account exists. Return the same error for an unknown user and a wrong password.

## Content translation

When staff publish a warta or similar written content, the server machine-translates it once into the other 3 locales and stores the results in `content_translations`, marked auto-translated. Readers see their locale. Staff can correct a translation. The original is never overwritten.

- Provider: Claude Haiku 5.5 (`claude-haiku-5-5`) through `@anthropic-ai/sdk`, called only from the server. `ANTHROPIC_API_KEY` lives in `config.ts` and never reaches the browser.
- Only content types meant for public reading (warta, announcements) are translated. Private content, such as pastoral or counseling notes, is never sent to an external service.
- Translation runs after the publish transaction commits, so a slow or failed API call never blocks or rolls back a publish. Each translation row has a status (`pending`, `done`, `failed`). The scheduled job retries rows that are not `done`. Until a translation is `done`, readers see the original.

## Error logging

Unexpected errors (anything `mapErrorToHttp` maps to 500) are saved to an error log table. A scheduled job deletes rows older than 1 month.

## UI rules

- Every list, table, and select uses infinite scroll over keyset pagination and renders only visible rows through virtualization. Never load a full table into the browser.
- Selects are searchable, like Select2: server-side search, debounced, infinite scroll over results, and keyboard navigation.
- All user-facing text comes from Paraglide messages. No hard-coded strings.
- Dialogs, confirmations, and toasts use the shared components. Never call browser `alert()` / `confirm()` / `prompt()`.
- A reusable custom component goes in `src/lib/components/`, not inside a route.
- zod error messages are message keys, translated at render time.
- Member screens are phone-first and must work for older users: large tap targets, readable text sizes, and support for OS text scaling.
- Primary brand color is `#8C0001`. The logo is `static/brand/grii-logo-source.png`, white, for dark backgrounds only.

## Code style

- **KISS.** Functions stay under ~40 lines and files under ~200 lines. Split when they grow.
- Code, identifiers, comments, and base-locale copy are English only. Indonesian appears only in translations and brand names (e.g. "Gereja Reformed Injili Indonesia").
- **Comments explain why, never what.** Don't add comments that restate the code, and don't add JSDoc to obvious functions.
- No speculative abstractions, options, or "for later" code.
- Every service function with logic gets a unit test. Branch scoping and audit writes get integration tests against the test Postgres.
