# Staff screens

Rules for the `(admin)` screens. Shared tokens, type, and formatting are in the root `DESIGN.md`; components are in `src/lib/components/DESIGN.md`. Staff screens use the staff density.

## 1. Shell

### Desktop (1100px and wider)

- One frame on `--ground` holds a 228px sidebar and a 48px top bar, with no line between them.
- The page is a sheet on `--surface`, inset 8px from the window's right and bottom edges, with a 16px radius, a 1px `--border` edge, and no shadow.
- Inside the sheet: 24px padding, then the title row.
- **Sidebar, top to bottom:**
  - A `#8c0001` logo tile, 56px tall, with the logo 32px tall and left-aligned at 16px. 8px radius, 8px inset from the frame.
  - The branch switcher showing the current branch's name. Staff with several branches choose here.
  - The modules. Each item is a 16px outline icon plus a 14px label on a 34px row. The active item is an `--active` pill with the label unchanged. Group labels are 12px grey sentence case.
  - Settings and the user row at the bottom.
- **Top bar:** a search box (about 548×32, centred), the theme switch, and the account button. Nothing else.
- A nav item shows a count only when it is a queue that needs action, such as "Service requests 3".

### Tablet (641-1099px)

The sidebar folds into the phone top bar. Tables keep 4-5 columns, with secondary fields as sublines.

### Phone (640px and narrower)

- The frame disappears and the sheet becomes the screen, with 16px side margins.
- **Top bar,** 48px on `--ground`: a `#8c0001` logo tile 40px tall (logo 24px), the screen title, the theme switch, and at most one action.
- A menu button opens a full-screen sheet with the modules, the branch switcher, and the account.

## 2. The title row

Every screen has one `h1` naming what it is, as a noun ("Members", "Sunday Service 09:00"), never a greeting. An optional grey second line states the finding or the scope ("3 requests waiting for approval"). Real actions go on the right of the title, and at most one of them is the filled primary.

## 3. List (members, events, books, requests)

- Title row: the title on the left, and at most one outlined secondary button and one primary on the right.
- Underline tabs for the list's states, on a full-width 1px rule.
- Toolbar: search (about 280×36) on the left, the total ("1,284 members") and sort on the right.
- The table sits on the sheet with no card around it. The header is 12px grey sentence case, with no fill band and no zebra striping. Rows are 48px, or 72px with a photo. Rules are 1px `--rule`.
- The name column gets the most width. One status pill per row, and one kebab at the far right.
- Infinite scroll over keyset pages, rendering only visible rows (`CLAUDE.md`). Keep the header in view while scrolling.
- **Phone:** each row becomes two lines. The name and the key figure go on line 1; the other fields in grey on line 2; the kebab on the right. Fields move to line 2, never disappear.

## 4. Detail (a member, an event, a service)

- A header card holds the object: its photo or cover, the name at 18/600, a grey meta line (date, time, place, branch), and outlined actions on the right.
- Under it, underline tabs (for a member: Profile, Family, Groups, Giving).
- The body is a 6-column grid with one 16px gutter. Card spans change by row, but every edge lands on the same lines. The widest card answers the screen's question.
- **Phone:** the header card keeps the photo, name, and meta, with actions in a kebab. Every card is full width, in the same order.

## 5. Settings

- A centred column of about 1152px. Each section is a row: a 450px label column (16/500 title and a 14px grey description) beside a 700px `--raised` panel (16px radius, 16px padding, no border).
- Sections are separated by a 1px rule with 32px above and below.
- Labels go above fields. Inputs are 40px, on `--surface`, with a 1px border and a 10px radius.
- One save model per view: either every control saves itself and shows "Saved", or there is one Save button per panel.
- Destructive actions go last, in their own section, as an outlined button in `--negative`, with an AlertDialog that names the object.
- **Phone:** the label column stacks above its panel.

## 6. Signature elements

These two are built from GRII's own work, not from a dashboard template.

- **Live check-in count** (Worship). During a service, the title row shows "214 checked in" at 28px, with the comparison in words ("last Sunday at this time: 198"). The check-in list sits below with the search focused. Typing filters the list, Enter checks in the selected person, and a family can be checked in with one action. Each check-in shows a quiet toast, never a dialog.
- **Serving cover** (Ministry). A matrix with ministries down the left (choir, ushers, offering collectors), each with its minimum ("needs 6"), and services across. Each cell shows signed slack against the minimum (+2, 0, −1). Cells with room stay plain; cells at or under the minimum tint toward `--negative`. The headcount appears on hover or tap. Services that will be short are the finding in the title row, next to an Assign button.
