# Membership Design (M2)

Module 2 in the build order (`PRODUCT.md`). It builds on the Foundation schema
in `2026-10-26-foundation-database-design.md` and changes its registration
flow. Research behind several choices: `reports/Church management software
features.md`.

## Why

GRII keeps member data per branch on paper or spreadsheets today. Families
should be able to put themselves on the books from their own phone, wherever
they are, while each branch admin stays the gate for who becomes a member.
Staff then need to see a person and their family at a glance, find people,
and pull a list when they need one. No product on the market covers an
Indonesian household register, branch-scoped data, WhatsApp, four languages,
and a phone-first member app together (see the research report).

## Goals

1. A family registers itself through its branch's registration link or QR
   code, in one sitting, on a phone.
2. The branch admin approves, rejects as spam, or sends the registration back
   with a reason so the family can fix it.
3. After approval every family member with an email or phone activates their
   own login with an OTP.
4. Staff browse and search their branch's members, open a member's record with
   their family, and export a filtered list.
5. Families and staff record big family events (marriage, death, moving out)
   through guided steps that keep households, the family tree, and the audit
   log consistent.
6. Members can find each other in an opt-in branch directory.

## Non-goals (this module)

- **Branch transfer.** To be decided by the user; not built here.
- **Email or WhatsApp blasts** to filtered members: the Integrations module.
- **Filtering by pelayanan (ministry):** the Ministry module.
- Baptism, sidi, and marriage _event registration_ (the photo becomes required
  there): the Events module. Membership only stores the person's status.
- Merging duplicate people after the fact. Membership flags duplicates before
  approval instead.
- A report builder, a workflow engine, staff approval of member edits.

## Anti-goals

- A registration or activation screen that reveals whether a person, email,
  phone, or account exists.
- A pending (unapproved) registration that shows up as a member anywhere, gets
  a Member ID, or can log in.
- An existing member moved into another household without their own consent.
- A non-member counted, listed, or exported as a member.
- Spam registrations that cost the branch admin more than one tap each.
- An export that contains NIK, photos, or contact details of anyone under 17,
  or that leaves no trace of who exported it.
- A child listed in the member directory.
- A life-change action that leaves a household, a relationship row, or an
  audit row half-written.

## Decisions made by the user

1. **One registration link per branch.** It is permanent, not listed anywhere
   in the app, and works for anyone who knows it. The church prints a QR code
   that points to it. Each branch has a different link. This replaces the
   single-use, per-family link of the Foundation spec.
2. **Anyone in the family registers:** a parent or a grown child fills in
   their own data and the data of every family member.
3. **Registrations need approval** by the branch admin of that branch. On
   approval the registrant is notified that the account is approved, with
   instructions for how each family member activates their login.
4. **Rejection has two kinds.** Spam is closed. Otherwise the branch admin
   gives a reason and the registrant gets a link back to their registration
   to fix it and submit it again.
5. **Notices go by email,** or by WhatsApp when the registrant gave only a
   phone number.
6. **Submissions are rate-limited per device,** and registration data is
   checked for duplicates.
7. **Required fields** for every person: full name, nickname, sex, birth date,
   birth city, address (street, postal code, city), occupation, education,
   previous church, baptism status, sidi status.
8. **Optional fields:** NIK, Chinese name, photo. The photo becomes required
   later, when someone registers for baptism, sidi, or similar (Events).
9. **"None" is an answer** for occupation, education, and previous church, so
   a young child's form can be completed.
10. **Baptism and sidi start with yes/no.** Yes makes date and church
    required.
11. **Address is copied** from the registrant to each family member by
    default and can be changed.
12. **Activation:** the person enters their email or phone, receives an OTP,
    enters it, sets a password, and the account is active. The OTP lives 5
    minutes; resend unlocks after 60 seconds.
13. **Activation never reveals anything:** for an unknown, already active, or
    otherwise ineligible email or phone the screen says the same thing ("If
    this can be activated, we've sent a code") and sends nothing.
14. **Staff member record** shows the family as grouped lists: "This
    household" and "Family outside this household". Each name links to that
    person.
15. **Full family tree** is a separate screen, a diagram across households
    with the person highlighted. It is for admins only and can be switched off
    with a church-wide setting.
16. **Member directory:** in. Opt-in per person, the member chooses which
    details show, branch-scoped, children never listed.
17. **Guided life changes:** "Got married", "Passed away", "Moved out".
    Available to staff and to families for their own household. A family's
    action takes effect immediately, without approval, except when it adds a
    new member (decision 19).
18. **New people added by a family.** When a family adds a new person (a new
    spouse through "Got married", or a newborn), the family chooses whether
    that person wants to be a GRII member.
    - **Wants to be a member:** the person goes into the branch admin's
      approval queue, like a registration, and gets a Member ID only when
      approved.
    - **Does not:** the person is saved straight away as a _non-member
      record_, just for the family tree. They are not tracked as a member.
19. **An existing member listed in a new registration** (for example a
    member's son, listed again by his new wife's family) is linked to his
    existing record, keeping his Member ID, only after he consents.
    - Until he consents, the admin sees the registration as "waiting for
      consent" and cannot approve it.
    - After consent and approval, he moves into the new household and the
      spouse link is written.
20. **Export:** a button on the staff member list that downloads exactly the
    filtered list as `.xlsx`. Only `branch_admin` and `superadmin`, as its own
    permission, own branch only. Columns: Member ID, full name, nickname, sex,
    birth date, household, phone, email, city, home branch, baptism status,
    sidi status. Never NIK, photo, or contact details of anyone under 17.
    Every export writes an audit row with who, when, the filters, and the row
    count.

## Calls I made (check these)

- **Pending registrations live in their own table,** not in `people`. A
  `registrations` row holds the submitted household as validated JSON. Real
  `households`, `people`, `member_profiles`, `person_relationships`, and
  `accounts` rows are created only on approval, in one transaction. So a
  pending or spam registration can never appear in a member list, get a
  Member ID, or be activated, and closing spam deletes nothing real.
- **Member IDs are assigned at approval,** using the branch code and the year
  of approval. Numbers are never spent on spam.
- **The registrant activates like everyone else.** No password is set during
  registration; after approval every person with an email or phone (the
  registrant included) uses the activation flow.
- **Duplicate check never tells the registrant.** Saying "this person already
  exists" on a public form would reveal membership (anti-goal). Instead:
  - On submit, the form blocks only duplicates _inside the same submission_
    (the same NIK, email, or phone typed twice).
  - On submit, a person whose NIK hash, email, or phone matches an existing
    member is marked "consent needed" (decision 20). The match is never shown
    to the registrant.
  - On review, the admin also sees warnings for the same normalized full name
    plus birth date, against members and other pending registrations. From a
    warning the admin can send the matched member a consent request too.
- **How consent works.** The matched member gets a notice (email or WhatsApp,
  to their own account contact) with a link. After logging in they see who
  listed them and choose "Yes, that's me, link me" or "No".
  - A matched member with no activated account cannot get a notice; the admin
    records consent given in person, which is audited.
  - **No:** that person is dropped from the registration, and the admin can
    approve the rest. The registrant is told only that one person could not
    be added and to contact the church.
  - Consent requests do not expire; the registration waits in the queue,
    marked "waiting for consent".
- **Non-member records.** A non-member is a `people` row with no Member ID, no
  account, and no profile requirements beyond name, sex, and birth date. They
  appear in the family list and tree, labelled "not a member", and never in
  the member list, directory, or export. Staff can later turn a non-member
  into a member through the same approval step.
- **Newborns and other new members added by a family** create a pending
  entry in the same `registrations` queue, tied to the existing household,
  instead of a new household.
- **Rate limit:** at most 5 submissions per IP address per hour, counted in a
  throttle table like `login_throttles`. "Device" in practice means IP; a
  stricter device fingerprint is not worth the complexity.
- **Spam is closed silently.** The registrant gets no notice, so a spammer
  learns nothing.
- **Fix link:** a private token, sent with the reason, opens the registration
  pre-filled. It works until the registration is submitted again or closed.
  Resubmitting puts it back in the admin's queue.
- **Who approves:** `branch_admin` of the link's branch, `superadmin` for any.
  Pending count shows in the staff sidebar.
- **Rotating a branch link:** a `branch_admin` can replace the branch's link
  (for example after it leaks to spammers). The old link stops working; the
  QR code must be reprinted.
- **Church profile fields go in `member_profiles`,** one row per person, as the
  Foundation spec planned. Occupation and education are fixed lists (with
  "none"), previous church is free text (with "none").
- **Death is a person status, not a delete.** `people` gets `deceased_on`
  (date, nullable). A deceased person stays in the tree and in history, drops
  out of the default member list, the directory, and exports, and their
  account is suspended and sessions ended.
- **Got married, as a family:** a household adult marries a person of their
  own household to a new person they add (decision 19: member or
  non-member). Marrying someone who already belongs to another household is
  staff-only, because a family cannot act on another household.
  - Result: the couple moves to a new household, a `spouse` relationship row
    is written with the wedding date, and each old household that ends up
    empty is soft-deleted. If the new spouse is waiting for approval, the move
    and the spouse row are written on approval.
- **Moved out:** a household adult moves a person of 17 or over into a new
  household of their own. Their relationship rows stay (Foundation rule 4).
- **Passed away:** a household adult or staff sets the date of death.
- **Family tree access:** `branch_admin`, `pastor`, and `superadmin`, within
  their branch scope, plus the existing read-only cross-branch rule for
  relatives. The switch is the `system_settings` key
  `membership.family_tree_enabled`, boolean, default `true`, superadmin only.
- **Directory fields a member can show:** photo, phone, email, city. Name and
  nickname always show once listed. Listing is per person and off by default;
  only the person themself (or an adult acting for them) turns it on, and
  turning 17 does not list anyone automatically. Only logged-in members of the
  same branch see the directory.
- **Export permission** is a new permission checked in the export service, not
  a new role: `branch_admin` and `superadmin` hold it.
- **Staff member list:** search by name, nickname, Chinese name, or Member ID;
  filter by city and by status (active, deceased); superadmin also filters by
  branch. Keyset pagination and virtualization per `CLAUDE.md`. Export uses
  the same filters, streamed server-side, capped at 10,000 rows per file.

- **Who sees members:** the staff member list and member record are for
  `branch_admin`, `pastor`, and `superadmin`, within their branch scope.
  `group_admin` does not see them. NIK shows masked to these roles only.
- **Home branch** of every person in a registration is the link's branch.
- **Notice language** is the locale the registrant used on the form, stored as
  each person's `preferred_locale`.
- **Relationships on the registration form.** Each added person picks their
  relation to the registrant: spouse, child, parent, or sibling. On approval:
  - A child is written as a child of the registrant and, by default, of the
    registrant's spouse; a "not a child of <spouse>" checkbox covers
    step-children.
  - Two parents on the form are written as spouses of each other unless
    unticked.
  - A sibling is written as a child of the parents listed on the form. With no
    parents on the form, a sibling is in the household only, with no tree row.
- **Undoing life changes.** Staff can reverse "Passed away" (clears
  `deceased_on`, reactivates the account) and "Moved out" (moves the person
  back), each as its own audited action. A family's "Passed away" asks for the
  date of death and a confirmation naming the person before it applies.
- **Export household column** shows the Member ID of the oldest adult in the
  household, since households have no name.
- **Message providers (user's choice).** WhatsApp goes through the official
  WhatsApp Cloud API directly from Meta, with no reseller. Email goes over
  plain SMTP: Google Workspace SMTP while building, Amazon SES (Jakarta region)
  before launch, switched by `.env` settings only. Until GRII's Meta Business
  verification, phone number, and four templates (OTP, approved, needs fix,
  consent request) exist, the sender uses a dev/test stub that logs messages.
  WhatsApp business messages need pre-approved templates, so the WhatsApp
  "needs fix" notice says "open the link to see what to fix" and the reason
  shows behind the link; email carries the reason in the message.

## Data changes

New or changed tables. Columns follow the Foundation conventions (uuid v7,
`created_at`/`updated_at`, soft delete, snake_case).

- **`registration_links`** becomes one live link per branch: drop `used_at`,
  `household_id`, and `note`; keep `token_hash`, `branch_id`,
  `created_by_person_id`, `revoked_at`. Partial unique `branch_id where
revoked_at is null and deleted_at is null`. Rotating revokes the old row and
  inserts a new one in one transaction.
- **`registrations`** (new): `id`, `registration_link_id`, `branch_id`,
  `status` (`pending`, `needs_fix`, `approved`, `spam`), `payload` (jsonb,
  validated by the shared zod schema; NIK inside it encrypted the same way as
  `people.nik_encrypted`), `fix_reason` (text, nullable), `fix_token_hash`
  (char(64), nullable, unique), `contact_email`, `contact_phone` (the
  registrant's, for notices), `submitted_at`, `decided_by_person_id`,
  `decided_at`, `household_id` (set on approval). Index `(branch_id, status,
submitted_at)` for the queue.
- **`registration_throttles`** (new): like `login_throttles`, keyed by an HMAC
  of the IP, hard-deleted by the same daily job.
- **`member_profiles`** (new): `person_id` (PK, FK people), `occupation`,
  `education` (enums including `none`), `previous_church` (varchar, nullable
  meaning none), `baptized` (boolean), `baptism_date`, `baptism_church`,
  `sidi` (boolean), `sidi_date`, `sidi_church`. Checks: date and church are
  not null exactly when the boolean is true.
- **`people`**: add `deceased_on` (date, nullable) and `is_member` (boolean,
  not null). `member_code` becomes nullable, with a check that it is not null
  exactly when `is_member` is true; the unique index becomes partial on
  `member_code is not null`.
- **`registrations`** also gets `kind` (`new_household`, `household_addition`,
  `member_link`), `target_household_id` (for additions), and per-person
  consent state inside the payload (`not_needed`, `waiting`, `given`,
  `declined`), plus a small `registration_consents` table (`registration_id`, `person_id` matched,
  `token_hash`, `decided_at`, `decision`).
- **`directory_listings`** (new): `person_id` (PK), `show_photo`,
  `show_phone`, `show_email`, `show_city` (booleans), `created_at`,
  `updated_at`. A row means listed. Removing the listing soft-deletes it.
- **`system_settings`**: add `membership.family_tree_enabled`.
- **`otp_codes`**: unchanged; activation already uses purpose `activation`
  with a 5-minute expiry.

Every write above is audited through `recordAudit` in the same transaction.
New audit actions include `registration.submitted`, `registration.approved`,
`registration.needs_fix`, `registration.spam`, `registration_link.rotated`,
`person.married`, `person.deceased`, `person.moved_out`,
`directory_listing.changed`, and `members.exported` (filters and row count in
the diff, never the rows).

## Flows

1. **Register.** The registrant opens `/register/<token>`, with no login. They
   enter themself, then add each family member with a relationship to them
   (spouse, child, parent). Each person can get an email or phone for a later
   login. On submit the server validates with the shared zod schema, checks
   the throttle and in-form duplicates, and inserts a `pending` registration.
   The screen says it will be reviewed and they will hear back by email or
   WhatsApp. Any person matching an existing member triggers a consent
   request to that member, and the registration waits for consent before the
   admin can approve it.
2. **Review.** The branch admin opens the queue, sees each person with their
   duplicate matches, and chooses one of:
   - **Approve:** one transaction creates the household, people, Member IDs,
     profiles, relationships, and unactivated accounts. Then the registrant is
     notified, with activation steps for each family member who has an email
     or phone. The notice is sent after the commit, like content translation,
     so a failed send never rolls back an approval; failed sends are retried
     by the scheduled job.
   - **Needs fix:** the admin writes a reason; the registrant gets it with the
     fix link.
   - **Spam:** closed, no notice.
3. **Fix and resubmit.** The fix link opens the registration pre-filled. The
   registrant corrects it and submits; it returns to `pending`.
4. **Activate.** As Foundation flow 3, with decisions 12 and 13.
5. **Staff browse.** Member list, member record with grouped family, full
   family tree screen (when enabled), export.
6. **Life changes.** Each is one short form and one transaction, from the
   member's household screen or the staff member record.
7. **Directory.** A member turns their listing on and picks fields; members of
   the same branch search the directory by name.

## Depends on

- **OTP delivery and the login OTP step** from Foundation, not built yet:
  WhatsApp provider with email fallback, and `otp_codes`. Activation and
  notices need it. The plan builds it first.
- **A message sender** (email plus WhatsApp) with retry, used for OTPs and for
  registration notices.

## Also changes with this design

- Foundation database spec: the `registration_links` table and flow 1
  (Register) change as above. Anti-goal "a registration link that can be used
  twice" is replaced by "a pending registration that acts like a member".
- `PRODUCT.md` Membership section: per-branch link and QR, approval, and the
  decisions above; branch transfer marked to be decided.
- `.gitignore`: add `.superpowers/` (brainstorm mockups).

## Left to the builder

- Screen layouts, within `DESIGN.md` and the folder `DESIGN.md` files.
- The `.xlsx` library (one small, maintained dependency).
- The occupation and education lists, in the four locales.
- How the registration form is split into steps on a phone.
- File split of the new schema and modules under the existing layout.
