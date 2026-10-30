# Global church management systems: Tithe.ly ChMS / Elvanto, ChurchSuite, Rock RMS, ChMeetings, Subsplash

Research date: 2026-10-27. Capterra, G2 and the ChurchSuite pricing page returned HTTP 403 to direct fetch, so review content below comes from search-result summaries of those pages, not full reads. No Reddit r/churchtech threads surfaced in search; community sentiment from Reddit is a gap.

## What modules does each product have, and what are pricing and target size?

### Takeaway
All five cover people, giving, groups, events, check-in and communication. They differ in pricing model: Elvanto bills per active adult, ChurchSuite per module and contact band, ChMeetings uses flat tiers by people count with a free tier, Subsplash bundles everything and quotes by size, and Rock RMS is free open source that you host or pay someone to host.

### Cited Findings

**Elvanto (Tithe.ly, Australia)**
- All features are included with no add-on modules. Feature areas: Administration, Pastoral Care, Worship (service planning, volunteer scheduling), Children + Youth (check-in), Financial — [Elvanto pricing](http://www.elvanto.com/pricing/)
- Pricing in USD by active adults: 50 adults US$19/mo (US$15.20 annual), 100 adults US$39/mo (US$31.20 annual), tiers up to 3000 and Unlimited; US$149 setup per plan; 20% annual discount — [Elvanto pricing](http://www.elvanto.com/pricing/)
- "An active adult is someone who attends your services, volunteers or gives financially." Children, Contacts and Archived people are free — [Elvanto pricing](http://www.elvanto.com/pricing/)
- Third-party sources conflict: one search summary cites AUD $30/mo for up to 99 adults and a free plan for 20 adults; Capterra/G2 list flat plans of $72 (ChMS + Giving) and $119 (with custom app). Treat these as unverified or bundle pricing for Tithe.ly's newer packaging — [Capterra Elvanto pricing](https://www.capterra.com/p/125780/Elvanto/pricing/); [Fitgap](https://us.fitgap.com/products/elvanto)
- GetApp lists "Multi-Location" and child check-in with label printing, barcode scanning and SMS to parents across rooms/locations — [GetApp UK](https://www.getapp.co.uk/software/103571/elvanto)
- Capterra lists "Tithely Church Management" at 4.8 from 623 reviews; its URL slug is "breeze-chms", which suggests Tithely ChMS is the former Breeze product, distinct from Elvanto — [Capterra compare](https://www.capterra.com/compare/132513-141654/Breeze-ChMS-vs-Rock-RMS)

**ChurchSuite (UK)**
- Priced by module count and contact count: Solo (Address Book only), Starter (three modules), Suite (all modules, fixed price), Bespoke (custom mix; route for 1500+ contacts). UK grid runs from £9/mo (Solo, 0-99 contacts) to £244/mo (Suite, 3,500-4,499 contacts). Address Book is always included — search summary of [ChurchSuite pricing](https://churchsuite.com/pricing)
- GetApp (2026) lists Solo $15.50, Starter $33, Suite $56 per month; it says Suite has 9 modules while the official page says 10 — [GetApp](https://www.getapp.com/nonprofit-software/a/churchsuite)
- Modules referenced on tour/blog pages: Address Book, Children, Giving, Bookings (with Flows), Small Groups, Rotas, Calendar, Planning — [ChurchSuite Address Book tour](https://churchsuite.com/tour/address-book); [ChurchSuite Children tour](https://churchsuite.com/tour/children); [2022 changelog](https://www.churchsuite.com/blog/2022-01-19-ongoing-updates-8th-october-19th-january-2022)

**Rock RMS (open source, US)**
- Free; can be self-hosted on-premises or on Azure/AWS/Google Cloud; self-hosters get support from the community — [Rock self-host](https://www.rockrms.com/self-host)
- Capterra: Rock RMS 4.9 from 101 reviews, has a free version — [Capterra compare](https://www.capterra.com/compare/132513-141654/Breeze-ChMS-vs-Rock-RMS)
- Engagement module "Connections" with connection types, opportunities, requests, statuses and workflow triggers — [Rock Connection Workflows](https://community.rockrms.com/documentation/engagement/connections/connections-tools/connection-workflows)

**ChMeetings**
- Plans by people count (monthly): Free $0 (50 people, 50 donations/month), V. Small $12 (100), Small $25 (250), Medium $40 (500), Large $50 (1,000), Unlimited $60. Annual: pay 10 months for 12. No setup or termination fee; free data migration — [ChMeetings pricing](https://www.chmeetings.com/pricing)
- Every plan includes: contribution tracking, people management, member portal, ministries management, church app, events and check-in, groups, form builder, follow-ups, calendar — [ChMeetings pricing](https://www.chmeetings.com/pricing)
- Extra cost: SMS/voice through ChMeetings credits (or free through your own phone, or Twilio direct), branded church app add-on. No platform fee on donations; PayPal/Stripe charge processing — [ChMeetings pricing](https://www.chmeetings.com/pricing)
- Vendor scope also includes church accounting and volunteer scheduling — [GetApp ChMeetings](https://www.getapp.com/all-software/a/chmeetings/)

**Subsplash (church app platform)**
- Subsplash Giving: $0/mo, 2.3% + 30c cards, 1% ACH (lower with "GrowCurve"). Page also shows 2.99% + 30c elsewhere; conflict unresolved — [Subsplash pricing](https://www.subsplash.com/pricing)
- Subsplash One (priced by church size and usage, not published): websites, media, custom mobile and TV apps, live streaming, giving, people management, event registration, groups and messaging, volunteer management, child check-in, service planning, email and SMS, podcasting, forms — [Subsplash pricing](https://www.subsplash.com/pricing)
- Enterprise adds custom API integrations, multi-campus app, and Rock RMS integration/plugin — [Subsplash pricing](https://www.subsplash.com/pricing)
- Other products: Workflows, Pulpit AI, Trends AI, Subsplash Tap — [Subsplash pricing](https://www.subsplash.com/pricing)

### Inferences
- Target size: ChMeetings and Elvanto lowest entry cost suit small churches; ChurchSuite scales by contact band to ~4,500 contacts before bespoke; Rock suits large churches with IT staff (free licence, heavy hosting and admin burden); Subsplash is app/media-first and suits churches wanting a branded app with ChMS bundled.
- Elvanto's "children free, contacts free" billing is a useful pattern: only active adults cost money.

### Gaps
- ChurchSuite full price grid by band could not be fetched (403).
- Exact Subsplash One prices are unpublished.
- Which ChMeetings tier unlocks accounting, automations and advanced reports did not render.

## People/membership: records, custom fields, households, relationships, joining, directory, privacy, GDPR, export, permissions

### Takeaway
Rock RMS models people most richly: families are groups, a person can be in several families, and "known relationships" form a typed, bidirectional relationship graph stored as hidden per-person groups. Elvanto and ChurchSuite use a single family/household with fixed relationship roles. ChurchSuite has the strongest GDPR tooling (per-field member visibility, consent tracking, right-to-be-forgotten request).

### Cited Findings

**Rock RMS**
- Fixed core fields (first name, last name, email). Custom "Person Attributes" of type Text, Date, Number, Dropdown, Boolean, Document, grouped into categories — [Rock Intro to People](https://community.rockrms.com/documentation/church-management/people/overview/intro-to-people)
- Age classification is computed: Adult if over 18 or an adult in any family; Child if under 18 or a child in all families; else Unknown. Recomputed on save and by a cleanup job. Grade derived from graduation year and a configurable transition date — [Rock Intro to People](https://community.rockrms.com/documentation/church-management/people/overview/intro-to-people)
- Every person belongs to at least one group of type Family and may belong to several. Addresses belong to the family, not the person (Home, Work, Previous, plus custom). A Primary Family ID is stored and changed by reordering families — [Rock Intro to People](https://community.rockrms.com/documentation/church-management/people/overview/intro-to-people)
- Known relationships are stored as groups: each person has a hidden group holding everyone they are linked to. Admins add relationship types by editing the Known Relationship group type's roles. Built-ins include Grandparent and Invited By — [Rock Use Known Relationships](https://community.rockrms.com/documentation/church-management/people/person-profile-page/use-known-relationships)
- Creating a relationship automatically creates the inverse on the other person; a relationship type can grant "can check-in" (e.g. grandparents checking in grandchildren) — [Rock U Known Relationships](https://chiptraining.rockrms.com/ask-chip-training/rocku/193)
- Community guidance: known relationships are mostly for parent/child or grandparent ties between adults in different households; alternative is adding the person to a second family — [Rock community Q&A](https://community.rockrms.com/ask/using/1412)
- Joining/follow-up: Connection requests carry statuses (one default, optional required note on change) and states; workflows trigger on status overdue, activity added, placement group assigned, future follow-up date, celebration added, or manually — [Rock Connection Workflows](https://community.rockrms.com/documentation/engagement/connections/connections-tools/connection-workflows); [Rock U Connection Types](https://chiptraining.rockrms.com/ask-chip-training/rocku/1775)
- Staff workload reporting on connection requests is built as a community recipe (statuses "No Contact", "In Progress") — [Rock recipe 442](https://community.rockrms.com/recipes/442/connection-request-workload)

**Elvanto**
- Built-in family relationship types: Primary Contact, Spouse, Child, Sibling, Partner, Other. Elvanto "supports immediate family structures best". Admin links people from the Family tab on a profile — [Elvanto Working With Families](https://help.elvanto.com/hc/en-us/articles/7481201498903-Working-With-Families)
- CSV import groups people into a family by a shared Family ID — [Elvanto Importing People](https://help.elvanto.com/hc/en-us/articles/7503488972055)
- Record states: Active (billed), Contacts (only basic fields editable: name, contact details, gender, DOB, school grade, marital status, anniversary, demographics, locations, people flows, groups, events, forms), Archived (hidden by default) — [Elvanto families/contacts help](https://help.elvanto.com/hc/en-us/articles/7481201498903); [Elvanto pricing](http://www.elvanto.com/pricing/)
- "People Categories" create custom fields and layouts per kind of person; people link to demographics and locations — [Elvanto People features](https://www.elvanto.com/features/people/)
- "People Flows" move people through processes (listed as an editable field on contacts) — [Elvanto help](https://help.elvanto.com/hc/en-us/articles/7481201498903)

**ChurchSuite**
- Address Book uses tags ("smart tags" to target messages), key dates (milestones like First Visit, Baptism, Wedding to track integration, discipleship, pastoral care), and Flows (process automation, e.g. newcomer integration; redesigned January 2022 in Address Book, Children, Giving, Bookings) — [Address Book tour](https://churchsuite.com/tour/address-book); [2021 changelog](https://www.churchsuite.com/blog/2021-10-07-ongoing-updates-5th-august-7th-october-2021); [2022 changelog](https://www.churchsuite.com/blog/2022-01-19-ongoing-updates-8th-october-19th-january-2022)
- GDPR: members get granular control over which contact details other members see in My ChurchSuite; right-to-be-forgotten request notifies the church's data protection contact; every email has unsubscribe; public forms show the church's privacy notice and an explicit opt-in; consent requests can be sent and responses evidenced — [ChurchSuite GDPR](https://churchsuite.com/gdpr); [Managing ongoing consent (2018)](https://churchsuite.com/blog/2018/04/23/managing-ongoing-consent-using-churchsuite)
- In practice, on first login members are asked to check details, pick communication preferences, and choose which contact details (if any) are visible to other members — [St Paul's Letchworth GDPR guide (2019)](https://stpaulsletchworth.co.uk/wp-content/uploads/2020/12/St-Pauls-General-Data-Protection-2019.pdf)
- A church notice says details are visible only to other members who also agreed to be recorded (reciprocal visibility) — [Sidcup Baptist ChurchSuite notice, Feb 2026](https://www.sidcupbaptistchurch.org.uk/site_files/5710/upload_files/ChurchSuiteUseNoticeFeb2026.pdf?dl=1)

**ChMeetings**
- People management, member portal, form builder and follow-ups management included on all plans — [ChMeetings pricing](https://www.chmeetings.com/pricing)
- Reviewer: very easy to add members, edit members, send bulk emails. Another: occasional visitors get archived past a point, they wanted more "active" members — [Capterra/GetApp ChMeetings via search](https://www.getapp.ie/reviews/117775/chmeetings)

**Subsplash**
- Unified user profiles synced across app, giving, groups; editable by admins or the user; member interactions feed the database automatically. Household support appears only in third-party listings ("individuals and families") — [faith.tools Subsplash](https://faith.tools/app/subsplash); [Capterra Subsplash](https://www.capterra.com/p/177932/Subsplash/)

### Inferences
- Design pattern for GRII: a household table with roles (Elvanto/ChurchSuite style) covers most needs; a separate typed, bidirectional relationship table (Rock "known relationships") covers grandparents, guardians, "invited by", and "can check in" without forcing multiple households.
- Rock's rule that addresses belong to the family matches a household-owned address model.
- Elvanto's Active/Contact/Archived split and ChurchSuite's key dates are cheap features with high pastoral value.
- ChurchSuite's per-field, reciprocal directory visibility set by the member is the reference model for a privacy-respecting member directory.

### Gaps
- Export options and staff permission models (field-level security, role-based access) for each product were not found in sources fetched. Rock is known to have page/block-level security and Data Views, but this was not confirmed from a fetched page.
- Self-registration/connection card specifics for Elvanto and ChMeetings not confirmed.
- Subsplash household model unconfirmed by vendor.

## Communication targeting (email/SMS/push by location, group, team, tag)

### Takeaway
Evidence is thin. ChurchSuite targets by tags; Subsplash bundles email, SMS and in-app group messaging; ChMeetings sells SMS credits or uses your own phone/Twilio.

### Cited Findings
- ChurchSuite smart tags make sure "the right messages reach the right people" — [ChurchSuite Address Book tour](https://churchsuite.com/tour/address-book)
- Subsplash One includes email and SMS messaging plus in-app groups and messaging — [Subsplash pricing](https://www.subsplash.com/pricing)
- ChMeetings SMS/voice via credits, own phone, or Twilio — [ChMeetings pricing](https://www.chmeetings.com/pricing)
- Elvanto reviewer praised reminder and messaging features — [Capterra Elvanto reviews (via search)](https://www.capterra.com/p/125780/Elvanto/reviews/)

### Gaps
- Push notification targeting rules, per-location filters and WhatsApp support not found for any product.

## Multi-site support

### Takeaway
ChurchSuite documents multi-site best: up to 15 sites free under one account with shared settings. Subsplash multi-campus app is Enterprise-only. Elvanto multi-location exists per GetApp but details were not found.

### Cited Findings
- ChurchSuite: up to 15 sites at no extra cost; more need support and may cost extra; all sites share account settings, privacy notice and data protection contact; managed from Administrator > Sites — [ChurchSuite multi-site](https://support.churchsuite.com/article/216-multi-site-functionality)
- ChurchSuite 2016: meant for geographically distinct worshipping communities with centralised administration, or related charities (e.g. foodbanks) needing a separate Address Book (older info) — [ChurchSuite 2016 changelog](https://churchsuite.com/blog/2016-01-26-ongoing-updates-12th-december-26th-january-2016)
- Elvanto lists "Multi-Location"; check-in across rooms/locations — [GetApp Elvanto](https://www.getapp.com/all-software/a/elvanto/)
- Subsplash multi-campus app in Enterprise tier — [Subsplash pricing](https://www.subsplash.com/pricing)
- ChMeetings pricing page does not mention multi-site — [ChMeetings pricing](https://www.chmeetings.com/pricing)

### Inferences
- ChurchSuite's "one account, many sites, shared privacy settings" closely matches GRII's branch model (central admin, branch-scoped data).

### Gaps
- How ChurchSuite and Elvanto scope staff permissions per site, and whether a person can belong to several sites, not confirmed.

## Member-facing app: what members can do themselves

### Takeaway
ChurchSuite (My ChurchSuite) lets members edit their details, set directory visibility and consent. Subsplash is the most app-centric (branded mobile/TV apps, groups, giving, volunteer schedules). ChMeetings includes a member portal and church app with branded app as paid add-on.

### Cited Findings
- My ChurchSuite: members update personal details, communication preferences, directory visibility, and request erasure — [ChurchSuite GDPR](https://churchsuite.com/gdpr); [St Paul's guide](https://stpaulsletchworth.co.uk/wp-content/uploads/2020/12/St-Pauls-General-Data-Protection-2019.pdf)
- Subsplash apps include in-app groups, messaging, volunteer schedule management; users can update their own profile — [faith.tools Subsplash](https://faith.tools/app/subsplash)
- ChMeetings: member portal and church app on all plans; one reviewer said the custom app sometimes updates on load when nothing was published — [ChMeetings pricing](https://www.chmeetings.com/pricing); [GetApp ChMeetings](https://www.getapp.com/all-software/a/chmeetings/)

### Gaps
- Elvanto member login capabilities (edit family, view giving history, roster accept/decline) not found in fetched sources.
- Rock's external member pages not researched.

## Review praise and complaints

### Takeaway
Ratings are uniformly high (4.5 to 4.9). Recurring complaints: Elvanto onboarding and post-acquisition stagnation; Rock documentation and navigation; ChMeetings extra-fee features; Subsplash value for money lowest sub-score.

### Cited Findings
- Elvanto: GetApp 4.5/5 from 126 users — [GetApp AU Elvanto](https://www.getapp.com.au/software/103571/elvanto)
- Elvanto 2025 Capterra reviewer (lead pastor, 2+ years): praised Tithely integration, website platform, reminders; said onboarding is hard and some functions are "not always intuitive"; originally switched for cost and customer service — [Capterra Elvanto reviews](https://www.capterra.com/p/125780/Elvanto/reviews/)
- Elvanto GetApp reviewer: "since being purchased by Tithe.ly, the suite seems to be put on the back burner in terms of development" (listing dated 2016; timing unclear) — [GetApp Elvanto](https://www.getapp.ca/software/103571/elvanto)
- Elvanto 2016 review: check-in printing "hit and miss", no offline check-in, no real BI/dashboards (older info) — [GetApp Elvanto](https://www.getapp.co.uk/software/103571/elvanto)
- Tithe.ly 2.0 reviewer: "dysfunctional, dated, and mismatched UX and UI", support worsened over time; Tithe.ly responded — [Capterra Tithe.ly reviews p4](https://capterra.com/p/154664/Tithe-ly-Church-Giving/reviews/?page=4)
- Rock RMS: Capterra 4.9 (101 reviews, updated 13 March 2026), ease of use 4.5, support 4.6; praise for community network and staff time saved; a database administrator called it hard to navigate with often lacking documentation — [Capterra Rock RMS reviews](https://capterra.com/p/141654/Rock-RMS/reviews/)
- ChMeetings: 4.9/5 from 154 reviews; praised affordability and all-in-one price; some say extra fees for certain features reduce value — [Capterra CA ChMeetings](https://www.capterra.ca/software/184192/chmeetings)
- Subsplash: Capterra 4.5 (136); value for money ~4.2-4.3, support 4.4 — [Capterra SG Subsplash](https://www.capterra.com.sg/software/177932/subsplash)

### Inferences
- Rock's power comes with a staffing cost; small churches find it hard. Simplicity of onboarding is a differentiator for smaller ChMS.

### Gaps
- No Reddit r/churchtech threads found; G2 and TrustRadius detail pages blocked or not reached.
- ChurchSuite reviews not retrieved at all.
