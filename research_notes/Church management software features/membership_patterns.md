# Membership / People-Management Patterns Across ChMS Products (2025-2026)

Scope note: about 20 search/fetch calls. Primary sources are vendor help docs (Planning Center, Rock RMS, Realm/ACST, ChurchSuite, Elvanto, Touchpoint, Churchteams, ParishSOFT, PowerChurch, Subsplash, ChurchTrac). Review-site material comes from Capterra, G2 and GetApp aggregations. I found **no Reddit r/churchtech threads** through search, and **nothing primary for CCB/Pushpay, Fellowship One, or Shelby**. Treat those products as uncovered.

## 1. Households vs. relationship graphs vs. family trees

### Takeaway
The dominant pattern is a hybrid. A **household/family group** owns address, campus and mailing ("giving unit"), and a person can belong to more than one household, with one marked primary. Beside it sits a **typed person-to-person relationship list** for links outside the household (grandparent, "allowed check-in by", family of origin). No mainstream ChMS models a real family tree. Life changes (marriage, divorce, adult child leaving) are handled by explicit "split / merge household" workflows, not by free editing.

### Cited Findings
- Planning Center: "people in Planning Center can belong to multiple households". Each household has a gold-star primary contact, whose contact info is used for the household in lists and reports such as mailing labels. Roles are parent/guardian, child and other adult. Parents/guardians can edit household members' profiles in Church Center, register them for signups and check in children. Children cannot add new profiles; adults can. — [PCO Households](https://help.planningcenter.com/en/138577-households.html)
- Planning Center: when the Households toggle is on in Church Center, congregants can add or remove household members themselves. People added through a form show as "pending" until they confirm. — [PCO Households](https://help.planningcenter.com/en/138577-households.html)
- Rock RMS: "Every person in the database belongs to a specific group type called Family." A person can be in several families, with a hidden primary family. "Addresses are tied to the family, not the individual." — [Rock Person & Family Field Guide](https://community.rockrms.com/documentation/BookContent/5/44)
- Rock RMS "Known Relationships" are separate from family. Types include Grandparent, Parent, Child, Invited by and Allow check-in by. Custom types can be defined. Many types auto-create their inverse (Grandparent creates Grandchild). Life-event guidance uses "Previous Spouse" after a death and "Former Spouse" after a divorce. — [Rock docs](https://community.rockrms.com/documentation/BookContent/5/44)
- Realm (ACST) has explicit life-change workflows:
  - **Separate Household** for divorce or separation. For dual custody, check both families and pick a Primary Family.
  - **Get Married** merges the partner in.
  - **Change Household** for moving out.
  - When a child in several families becomes an adult, changing Family Position from Child to Other removes them from all but the primary (custodial) family.
  - The page has no death workflow. — [Realm Life Change Scenarios](https://help.acst.com/en/realm/how-to/profiles/life-changes/scenarios)
- Touchpoint: an adult child who marries or moves out is a "split". Move them into a new family, set them as primary adult, and update address and phone. — [Touchpoint: Move Person to New Family](https://docs.touchpointsoftware.com/People/SplitPersonFromFamily.html)
- Churchteams recommends a "Related To" link so that a person who ages out of a household keeps a record of their family of origin. — [Churchteams: remove or add family members](https://help.churchteams.com/knowledge/remove-or-add-family-members)
- ParishSOFT: an adult child who registers at a new parish becomes head of a new family record there. The old parish keeps an inactive copy, and contribution history stays with the former church. — [ParishSOFT article](https://support.parishsoft.com/hc/en-us/articles/14636365356059)
- ChurchTrac documents "Families Moving Apart" and "Families Coming Together" as distinct cases. — [ChurchTrac: changing family assignments](https://www.churchtrac.com/support/changing-family-assignments)
- Legacy limitation: an older PowerChurch forum thread (2005-2009) says the only option for a child of divorced parents was two separate profiles, one per family. Single-household models force duplicates. — [PowerChurch forum](https://www.powerchurch.com/forum/viewtopic.php?p=17489)

### Inferences
- The minimum viable model is: person; household (owns address); membership in many households with one primary and a role; plus a typed, bidirectional relationship table for non-household kin. The current GRII foundation schema (people + households) fits this. A relationships table is the likely addition.
- Failure modes appear at the edges:
  - Shared custody needs multi-household membership.
  - Married children need a split while keeping a family-of-origin link.
  - Death needs a spouse to move to "previous spouse" status.
  - The household mailing/primary contact must change after death or divorce.
  - Vendors ship guided workflows for these cases because free-form editing leaves stale data.
- Multi-generation Indonesian/Chinese households living together fit "household with other-adult role". Grandparents living elsewhere fit the relationship table.

### Gaps
- No primary source found on CCB, Elvanto, ChurchSuite or Breeze family models in detail (Breeze is commonly described as single-family per person, but I did not verify that).
- No source quantifies how often blended or multi-household cases occur.

## 2. Member lifecycle, sacraments, death/transfer, duplicates

### Takeaway
Products separate a **connection/membership status** (visitor, attendee, member, ...) from a **record status** (active/inactive with a reason). Promotion is usually manual, driven by staff follow-up workflows. Duplicates are a chronic problem. Every vendor ships merge tooling, most merges are irreversible, and Rock adds score-based duplicate detection plus merge requests for users without edit rights.

### Cited Findings
- Rock connection statuses: Member, Attendee, Visitor, Participant, Pending. Record status is separate. Inactivating a family inactivates each member and removes them from groups, and Rock asks for a reason and a note. — [Rock docs](https://community.rockrms.com/documentation/BookContent/5/44)
- Rock stores previous names (for example a maiden name after marriage), and duplicate matching uses them. — [Rock docs](https://community.rockrms.com/documentation/BookContent/5/44)
- Rock duplicate scoring weights:

  | Field | Points |
  | --- | --- |
  | First or nick name | 15 |
  | Last name | 15 |
  | Previous name | 12 |
  | Mobile or email | 15 |
  | Birth month and day | 10 |
  | Birth year | 5 |
  | Gender | 3 |
  | Suffix | 10 |

  A score above 35 flags a possible duplicate. Ties go to the oldest record. The check is skipped for REST API adds. — [Rock docs](https://community.rockrms.com/documentation/BookContent/5/44)
- Rock merge: choose a master record, then pick the value to keep for each conflicting field. The replaced address moves to Previous Address. Users without edit rights submit a merge request, handled under Tools > Data Integrity. — [Rock docs](https://community.rockrms.com/documentation/BookContent/5/44)
- Subsplash has a Duplicate Detector and a merge that **cannot be undone**. Unique fields keep the primary profile's values, and gifts, groups and notes combine. — [Subsplash People merge](https://intercom.help/subsplash/en/articles/9021418-people-merge)
- PowerChurch has a Merge Duplicate Profiles utility that keeps contributions and attendance. The vendor advises a backup because "there is not a way to undo this process". — [PowerChurch newsletter 2017](https://www.powerchurch.com/support/456/5/powerchurch-software-newsletter-summer-2017)
- Churchteams merge: the "TO" record wins. Address and phone are overwritten, while emails, contributions and group history are appended. — [Churchteams merge duplicates](https://help.churchteams.com/knowledge/merge-duplicates-0)
- ParishSOFT can merge up to 5 duplicate records at once. Family-level merges may need diocese-level permission. — [ParishSOFT merge families](https://support.parishsoft.com/hc/en-us/articles/14637484056219-Merge-duplicate-family-records)
- Elvanto lifecycle as configured by one church:
  - New visitors are added as guests automatically.
  - They are reviewed after 6 attendances.
  - Regular attendance is judged over 2 months, then staff change the status to regular attendee.
  - Member Area access needs approval from the lead pastor and an elder.
  - Follow-up runs through "People Flows": steps, assignees and notifications. — [Hills Bible Church Elvanto policy](https://hillsbiblechurch.elvanto.com.au/file/3bd29621-41ff-4623-b166-61e90604d04f); [Elvanto People Flows](https://help.elvanto.com/hc/en-us/articles/7582111797655-Streamlining-Follow-up-with-Elvanto-Using-People-Views-and-People-Flows); [Centrepoint Elvanto guide](https://inside.centrepoint.church/elvanto/adding-managing-people)
- Transfers between churches (ParishSOFT): the new parish creates the record, the old parish keeps an inactive copy and the history, and the vendor suggests notifying the former church as a courtesy. — [ParishSOFT](https://support.parishsoft.com/hc/en-us/articles/14636365356059)

### Inferences
- For GRII multi-branch:
  - A branch transfer should be a status/branch change on a single person record with history kept, not a copy. Copying is the cross-database (ParishSOFT) pattern, and it creates duplicates.
  - Death should be a record status with a date, not a delete. This matches the soft-delete rule.
  - Spouse handling and the household primary contact need a workflow.
- Duplicate detection at create time (on name, phone/email, birthdate, previous name) is cheaper than merging later. Merge must reattach all child rows (attendance, giving, groups, attachments, audit) and is effectively irreversible. Audit it fully.
- Baptism, sidi (confirmation) and membership date are typically dated fields or "milestones" on the person. In Reformed churches these are core records, so they need certificate attachments.

### Gaps
- **No quantitative data found on duplicate rates** in church databases.
- No primary doc found on how vendors model baptism/confirmation records (Rock uses configurable person attributes and "steps"; not verified this session).
- CCB, F1 and Shelby lifecycle features were not covered.

## 3. Self-service profile and family editing; onboarding

### Takeaway
Leading products let members edit their own profile and household from the member app. Control comes from **admin-locked fields**, not approval queues. Approval queues exist (Churchteams) but are optional and off by default. Form submissions from logged-out users are confirmed by email before they apply.

### Cited Findings
- Planning Center: members update their profile (photo, gender, marital status and more) in Church Center. People cannot edit their name or any field with a lock icon. Admins choose the locked fields. Birthday and grade are admin-only. — [PCO: help people update their profiles](https://help.planningcenter.com/en/138575-help-people-update-their-profiles.html); [PCO blog: profile editing for households](https://www.planningcenter.com/blog/2019/09/easy-profile-editing-for-family-households)
- Planning Center: if a form changes a profile while the person isn't logged in, an email asks them to verify the change before it applies. — [PCO help](https://help.planningcenter.com/en/138575-help-people-update-their-profiles.html)
- Churchteams: optional "Require Member Update Approval" setting, off by default. Pending changes are reviewed at People > Person > Approve Updates. Staff can also send a request asking members to update only certain attributes. — [Churchteams: member self-update](https://help.churchteams.com/knowledge/how-does-churchteams-request-members-to-update-their-information-themselves); [Churchteams: update certain attributes](https://help.churchteams.com/knowledge/is-there-a-way-to-send-out-a-request-for-members-to-only-update-certain-attributes-0)
- ChurchSuite: members view and update their details in My ChurchSuite and choose which contact fields the congregation can see. I found no approval step. — [Greyfriars ChurchSuite guide](https://greyfriars.org.uk/churchsuite-4/); [ChurchSuite member case study](https://churchsuite.com/case_study/church-member-adapting-to-your-situation)

### Inferences
- Recommended GRII pattern:
  - Members edit contact fields directly.
  - Lock identity fields (name, birthdate, NIK, baptism/sidi/membership dates and status) to staff.
  - Optionally offer "request a change" for locked fields, which feeds a staff queue.
  - This matches the CLAUDE.md household-acting-for-member model.
- Onboarding by form, QR code or link creates "pending" records. Combine this with duplicate detection.

### Gaps
- I did not find specific QR-onboarding documentation (connect cards are mentioned only through the Text In Church integration).

## 4. Member directory privacy

### Takeaway
Modern practice is an **invite-only, opt-in directory with per-field sharing choices** set by the member. GDPR-region guidance expects opt-in and a confidentiality statement. Reviewers say mobile directories confuse less tech-savvy members.

### Cited Findings
- Planning Center directory:
  - It is invite-only, and admins or People managers enable it.
  - After accepting, people "choose exactly what personal and household information they would like to share", including whether others can contact them.
  - "Remove all" opts the whole household out.
  - Privacy mode allows email contact without exposing addresses. — [PCO: share information in the directory](https://help.planningcenter.com/en/141288-share-information-with-people-in-the-directory.html)
- Churches configure stricter defaults. In one, opting in shows only name and photo. — [Plymouth Church directory](https://www.plymouthchurch.com/news/plymouth-church-center-directory)
- Example consent form with three choices: full inclusion; inclusion without email/phone; no listing. — [Emmanuel Church](https://www.emmanuelchurch.ch/general-5)
- GDPR requires opt-in rather than opt-out for directories. Crockford's clerical directory re-asked clergy before May 2018. — [Church Times](https://www.churchtimes.co.uk/articles/2018/25-may/news/uk/crockford-s-clerical-directory-asks-clerics-to-opt-in-before-gdpr-deadline)
- An older UK guidance factsheet (pre-GDPR Data Protection Act) set two conditions for directories: members must know their details go in a directory for other members, and the directory must carry a confidentiality statement telling members not to share it. — [Grace Baptist Trust factsheet](https://www.gbtc.org.uk/documents/FSNEWDATAProtection_Users_imac_Desktop_GBTCTemplate.pdf)
- A printed directory limited to people who signed a consent form. — [Westcliff Baptist privacy notice](https://www.westcliffbaptistchurch.org.uk/wp-content/uploads/2022/08/WCBC-Data-Privacy-Notice-Aug2022.pdf)
- PCO reviewer: "member directory in the mobile app can be a little confusing for some of our members that are not tech-savvy". — [Capterra PCO reviews](https://capterra.com/p/76708/Planning-Center/reviews/?page=9)

### Inferences
- Defaults for GRII:
  - Directory off per person until they opt in.
  - Per-field toggles (phone, email, address, birthday, photo).
  - Household-level opt-out.
  - Minors hidden unless a parent opts them in.
  - Scope the directory per branch.
- Indonesia's PDP Law (UU 27/2022) is likely analogous, but it was not researched here.

### Gaps
- No ICO-authored church-specific guidance was found in search. Results were church-authored notices.
- No Parish Resources page was found.
- No data on volume of directory privacy complaints.

## 5. Segmentation, export, data protection

### Takeaway
Saved rule-based "smart lists" are the standard segmentation tool. They drive both automations and communication. Export is increasingly a **separate permission**. Under GDPR, church membership data is special-category data (religious belief). It is lawful for members and regular contacts under Article 9(2)(d), but it must not go outside the church without consent. That makes exports the main risk point.

### Cited Findings
- Planning Center Lists:
  - Lists are rule-based and can auto-refresh.
  - Automations only run when the list refreshes.
  - Editing a list's rules pauses its automations.
  - Lists that depend on other lists must be refreshed in creation order.
  - Collaborators have view or manage access. — [PCO Lists overview](https://help.planningcenter.com/en/139197-lists-overview.html); [PCO list settings](https://help.planningcenter.com/en/139198-list-settings.html); [PCO automations](https://help.planningcenter.com/en/automations-in-people.html)
- Planning Center (Feb 2025): "Can export CSVs and reports" became its own permission. Earlier, all users could export. Existing users kept the right, but new users need it granted. — [PCO blog: 5 new features in People](https://www.planningcenter.com/blog/2025/02/5-new-features-you-may-have-missed-in-people)
- Elvanto: saved "People Views" feed follow-up flows. — [Elvanto help](https://help.elvanto.com/hc/en-us/articles/7582111797655-Streamlining-Follow-up-with-Elvanto-Using-People-Views-and-People-Flows)
- GDPR Art. 9(2)(d) allows processing "in the course of its legitimate activities with appropriate safeguards" by a not-for-profit body with a religious aim. It covers only members, former members or people in regular contact, and data may not be disclosed outside the body without consent. — [GDPR Art. 9](https://gdpr-info.eu/art-9-gdpr/); [UK GDPR Art. 9](https://www.legislation.gov.uk/eur/2016/679/article/9)
- Church of England guidance: password-protect member spreadsheets, have privacy and data protection policies, and let people opt out of communications or request removal. — [Church of England guide](https://www.churchofengland.org/node/47406/printable/print)
- Church privacy notices commonly state they "will only share your data with third parties with your consent". — [Trinity Buxton privacy notice](https://trinitybuxton.org.uk/Publisher/File.aspx?ID=207832)

### Inferences
- For GRII:
  - Make export a distinct, branch-scoped permission.
  - Write an audit row for each export, recording the filter and row count.
  - Exclude sensitive fields (NIK, pastoral notes) from export by default.
  - The PCO change from "everyone could export" to a permission shows that the earlier default was seen as a mistake.
- Smart lists should be stored as saved filters evaluated at query time. That avoids PCO's refresh-ordering pain with dependent lists.

### Gaps
- No Breeze or ChurchSuite export-permission docs were fetched.
- No documented breach incidents tied to ChMS exports were found.

## 6. Communication targeting

### Takeaway
Messaging targets lists, groups and households built from membership data. Email and SMS are standard. WhatsApp support is rare and mostly delivered through integrations (ChMeetings, Saysimple). That matters for an Indonesian church.

### Cited Findings
- ChMeetings messaging:
  - Native links to WhatsApp, Messenger, Viber and Telegram from member profiles.
  - Email, SMS and push.
  - "Multi-campus communication support" (third-party listing).
  - Usage claims conflict: 7,000 churches vs 2,000 ministries. — [ZoftwareHub ChMeetings](https://zoftwarehub.com/products/chmeetings/features); [ChurchLeaders on ChMeetings](https://churchleaders.com/ministry-tech-leaders/373307-chmeetings-simplifying-the-church-administration.html)
- Saysimple offers a WhatsApp Business integration for ChMeetings: notifications for services, events and volunteering. — [Saysimple](https://www.saysimple.com/integrations/chmeetings)
- Planning Center's directory privacy mode allows congregant-to-congregant email without exposing addresses. — [PCO directory](https://help.planningcenter.com/en/141288-share-information-with-people-in-the-directory.html)
- The PCO household primary contact is used for mailing labels and household-level lists. — [PCO Households](https://help.planningcenter.com/en/138577-households.html)
- Church of England guidance: people must be able to opt out of communications at any time. — [CofE](https://www.churchofengland.org/node/47406/printable/print)

### Inferences
- Each person needs per-channel consent flags (email, WhatsApp, SMS), plus a choice of "send to household primary" or "send to each adult".
- Minors without accounts should be reached through guardians. This matches the GRII accounts model.

### Gaps
- No primary vendor doc on WhatsApp Business API use in ChMS.
- No data on channel effectiveness.

## 7. Reporting churches actually use

### Takeaway
I found only vendor-marketing evidence. Products advertise attendance trends, giving trends, demographics, and "who stopped attending" lapse detection. Reviewers complain that custom reports are hard to set up.

### Cited Findings
- Church360 Members markets dashboards for attendance and giving trends. Its example is spotting an attendance drop that signals a pastoral-care need. It also offers demographic segmentation such as follow-up with lapsed attenders. — [GetApp Church360 Members](https://www.getapp.co.uk/software/2080679/church360deg-members)
- Attendance Now markets real-time attendance trend dashboards (4.9/5 from only 15 reviews). — [GetApp Attendance Now](https://www.getapp.co.uk/software/130307/attendance-now)
- Breeze reviewer: "haven't really been able to get in to, or define, preset reports that I will use frequently". — [Capterra Breeze reviews](https://www.capterra.com/p/132513/Breeze-ChMS/reviews/?page=10)
- PCO reviewer: "setup and coding of reports has a big learning curve". — [Capterra PCO reviews](https://capterra.com/p/76708/Planning-Center/reviews/?page=9)
- Elvanto lifecycle rules depend on attendance counts (6 visits, 2 months), so attendance data drives status changes. — [Hills Bible Church](https://hillsbiblechurch.elvanto.com.au/file/3bd29621-41ff-4623-b166-61e90604d04f)

### Inferences
- A small fixed set of canned reports likely beats a report builder:
  - Membership count by status/branch over time.
  - New members and visitors per period.
  - Lapsed attenders (no attendance in N weeks).
  - Age/gender distribution.
  - Upcoming birthdays.
  - Baptism/sidi counts per year.

### Gaps
- **No survey data found on which reports churches use most.** This is the weakest-evidenced section.

## 8. Most common admin complaints

### Takeaway
The recurring themes are a weak or inconsistent mobile app, steep learning curves and hard-to-find settings, hard report building, and pricing. Modular per-app pricing (PCO) and price increases after acquisitions (Breeze/Tithely, a competitor claim) are the pricing complaints. Many Breeze reviews list no cons. Per-person pricing complaints were not directly evidenced in this session.

### Cited Findings
- PCO mobile app complaints:
  - "Difficulty using the mobile app has proven challenging".
  - "Hard to use and I can't find the same info I can find on the website".
  - Occasional crashes. — [Capterra PCO](https://capterra.com/p/76708/Planning-Center/reviews/?page=9); [SaaSworthy PCO](https://www.saasworthy.com/product/planning-center-services/reviews)
- PCO complaints on usability and pricing:
  - "Steep learning curve".
  - "Even after years of use, I have spent dozens of minutes trying to find a certain feature or settings option".
  - "They charge you for each app separately". — [Capterra PCO](https://capterra.com/p/76708/Planning-Center/reviews/?page=4); [G2 PCO](https://www.g2.com/products/planning-center-services/reviews)
- Breeze complaints:
  - Limited integrations.
  - Occasional slowness.
  - Tithely forms/events not joined to Breeze people data.
  - "Value has decreased".
  - Flat $72/month pricing. — [Capterra Breeze](https://www.capterra.com/p/132513/Breeze-ChMS/reviews/?page=18); [G2 Breeze](https://www.g2.com/products/yourgiving-inc-breeze-chms/reviews); [G2 Breeze pricing](https://www.g2.com/products/breeze/pricing)
- ChurchTrac (a competitor) claims Breeze raised prices 33% after the Tithely acquisition, and says switchers cite cost and support. This is unverified competitor marketing. — [ChurchTrac vs Breeze](https://www.churchtrac.com/comparisons/churchtrac-vs-breeze)
- PCO pricing is modular per product. Cost rises with modules. — [CostBench](https://costbench.com/software/church-management/planning-center/alternatives/); [PCO vs Breeze (vendor)](https://www.planningcenter.com/compare-planning-center-vs-breeze)

### Inferences
- A phone-first member app with feature parity to the web is a clear differentiator. The mobile-vs-web gap is the most consistent PCO complaint.
- Guided life-change workflows and duplicate detection reduce data-entry burden more than extra fields do.

### Gaps
- No Reddit r/churchtech threads were retrieved.
- No CCB/Pushpay, Fellowship One, Shelby or Realm review sentiment was gathered.
- "Per-person pricing" complaints were not directly sourced.
- Review snippets come from aggregator summaries of review pages, so individual quotes were not each opened.
