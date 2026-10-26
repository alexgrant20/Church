# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Built for one church organization, GRII (Gereja Reformed Injili Indonesia), with GRII Pusat in Jakarta and multiple branch congregations. Two primary audiences carry equal weight:

- **Members (jemaat)**: congregants of all ages, including older and less tech-savvy people, using the installable PWA mostly on their phones. They register, check their profile and family data, sign up for events, and see schedules.
- **Staff**: branch admins, group admins, pastors, and superadmins doing desk work. They manage branches and members, run bulk worship check-in, schedule serving teams, and handle finance.

Roles: `superadmin`, `pastor`, `branch_admin`, `group_admin`, `member`. One person can hold several roles across branches.

## Product Purpose

One church management system for every GRII branch. It replaces scattered manual records for membership, worship attendance, services, events, ministry scheduling, finance, and the library. Success means members can do their church admin from a phone without help, and staff see only their own branch's data, with every sensitive action audited.

## Positioning

Built for one Reformed Evangelical church and its own branch structure, roles, and trilingual congregation. It is not a generic church SaaS product.

## Operating Context

- Worship services run in Indonesian, English, and Mandarin congregations. Programs include Kebaktian, PA & PD (Bible study and prayer meetings), catechism (katekisasi), premarital counseling, retreats, concerts, and offering/tithe giving.
- Staff check in members in bulk at worship services, often under time pressure.
- Shared and public devices are expected. The PWA never caches pages or data offline, so member and finance data do not stay on the device.

## Capabilities and Constraints

- **Status: in development, not deployed.** There are no production users, installed PWAs, live data, or migrations to keep compatible. Do not plan around backward compatibility, cache busting, or existing installs until this line changes.

- Stack: one SvelteKit app (Svelte 5, Tailwind 4) for both admin `(admin)` and member `(member)` views, Drizzle with Postgres, adapter-node. There is no native app; the PWA is the mobile experience.
- Module build order: Foundation (done), Membership, Worship, Special Services, Events, Ministry, Finance, Library, Schedule & Integrations (WA/Email, Instagram). See `docs/superpowers/specs/2026-08-30-foundation-module-design.md`.
- Data is scoped by branch through `role_assignments`. Staff must never see data from another branch.
- Expected scale is 20,000+ registered users, not concurrent.
- Code identifiers are English only. Indonesian domain terms map to English names through the table in the foundation spec.
- **UI languages:** Indonesian, English, and Chinese (Simplified and Traditional). Users can switch. Layouts must handle the different text lengths and CJK glyphs. Current UI copy is English only; i18n has not been built yet.

## Feature Scope

Confirmed by the user on 2026-10-26. Items marked *open* are not decided yet. Each module gets its own spec before it is built.

1. **Foundation**
   - Every login needs a password plus a one-time code (OTP). Codes go over WhatsApp through a third-party provider, with email as the fallback.
   - Password reset is also verified with an OTP. A user can request a reset at most once every 2 minutes.
   - Brute-force protection: record `last_login` and count failed login attempts. After too many failures, the user sees "try again in 2 minutes" and is blocked for 2 minutes.
   - Every list, table, and select loads its data in pages with infinite scroll. Only the rows on screen are rendered.
   - Foundation code must be fully optimized and clearly written. It sets the patterns that later code generation follows.
   - Code quality bar: clean design patterns, no N+1 queries, and no comments that only restate the code.
   - Audit log stores only the fields that changed, with their before and after values. Unchanged fields are not logged.
   - Errors are logged too. A scheduled job deletes error logs older than one month.
2. **Membership**
   - Staff create member records. Members do not self-register.
   - Staff give the person a code they use to claim or activate their account. *Open:* what form this code takes.
   - Baptism, confirmation (sidi), and marriage are not part of Membership. *Open:* they probably belong to the Events registration module.
3. **Worship**
   - Check-in works two ways: scan a QR code, or pick a worship service that is happening now or coming up.
   - One family member can check in their spouse and children together.
   - The warta (bulletin) and ringkasan (sermon summary) are printed together on one paper sheet today. They move into the app.
   - *Open:* whether a pastor or a `branch_admin` writes them.
4. **Special Services** (prayer and funeral services)
   - Members request a service.
   - A `branch_admin` or `superadmin` approves it.
5. **Events**
   - Events can be free or paid. Each event can have a quota and a waitlist.
   - Non-members can register by giving extra details, such as name and address.
6. **Ministry** (choir, ushers, offering collectors)
   - Volunteers sign up for slots. Staff assign people only when nobody volunteers.
   - Volunteers can swap shifts.
7. **Finance**
   - Offerings, tithes, donations, finance management, and payroll.
   - Members can see their own giving history.
   - The church uses a static QRIS code, so individual donors are not tracked. Staff count and enter each day's total for each offering category.
   - Offerings have categories, such as Persembahan Utama and Persembahan Gedung. The category list must be configurable.
8. **Library**
   - Physical books and online books.
   - Covers selling, lending, and accepting donated books.
   - Each branch has its own library, but users can borrow from other branches.
9. **Schedule & Integrations**
   - WhatsApp and email messaging through a third-party provider. A WhatsApp Business API is available, but a third-party service is preferred.
   - Posts go to Instagram automatically, through the church's Instagram Business account.

**Home page:** every user, including guests, lands on a home page. It shows the member's next service (with Check in when check-in is open), this week's warta, and events. Guests see it without the personal blocks. Confirmed by the user on 2026-10-26; layout in `src/routes/(member)/DESIGN.md`.

**Guests (non-members):** can see the home page, read the warta, browse the library, and view and register for events.

**Groups:** a group is a sub-unit inside a branch, such as Sekolah Minggu 1 and Sekolah Minggu 2, or several Kebaktian Remaja groups that each have their own leaders. A group leader (`group_admin`) takes attendance at that group's gatherings. A member can belong to more than one group.

**Service languages:** a branch holds services in Indonesian, English, and Mandarin. A service can be in one language, and services in different languages, especially Indonesian and Mandarin, can run at the same time. Language belongs to the service; a language is not its own branch.

## Brand Commitments

- Church: GRII (Gereja Reformed Injili Indonesia). Head church: GRII Pusat, Reformed Millennium Center Indonesia, Jl. Industri Blok B-14 Kav.1, Jakarta Pusat. Reference site: https://pusat.grii.org/.
- Theological identity: Reformed Evangelical (Reformed Injili). Use the church's own terms, such as "Pengakuan Iman Reformed Injili" and "Kidung Reformed Injili".
- Voice: formal, informational, concise. This matches the church's own copy.
- The user said not to use the layout of pusat.grii.org as a design guideline. Take only brand assets and facts from it.
- Primary brand color: `#8C0001` (confirmed by the user).
- Name: "GRII (Gereja Reformed Injili Indonesia)" in every locale, including Chinese. There is no separate Chinese name.
- User-facing app name: "GRII (Gereja Reformed Injili Indonesia)". Use "GRII" where space is tight, such as the manifest `short_name` and the home-screen label. "ChurchApp" is only the internal codename (package and repo).

## Evidence on Hand

- Logo: `static/brand/grii-logo-source.png` (886×443 PNG, white on transparent), scraped from pusat.grii.org. The user confirmed it as the logo to use. Because it is white, it only works on dark or `#8C0001` backgrounds. There is no vector version.
- The only official brand color on record is the primary `#8C0001`. Do not present any other color as official.- No testimonials, statistics, or member counts may be fabricated. The 20,000+ figure is a planning estimate, not a public claim.

## Product Principles

1. **Branch isolation is non-negotiable.** Every view and action stays inside the user's accessible branches.
2. **A phone-first member experience that works for older congregants.** Use plain flows, big targets, and no assumed tech fluency.
3. **Staff speed for repetitive work.** Bulk check-in and scheduling should take as few steps as possible.
4. **Trilingual by design.** No string or layout may assume one language or one script.
5. **Trust over convenience.** Keep sensitive data off devices, audit sensitive actions, and allow instant session revocation.

## Accessibility & Inclusion

The member audience includes older and less tech-savvy users, so use readable type sizes, high contrast, and large tap targets, and support OS text scaling. Indonesian, English, and Chinese (Simplified and Traditional) all need correct rendering, with the right `lang` attribute per locale.
