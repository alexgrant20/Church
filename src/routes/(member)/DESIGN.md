# Member screens

Rules for the `(member)` screens. Shared tokens, type, and formatting are in the root `DESIGN.md`; components are in `src/lib/components/DESIGN.md`. Member screens use the member density.

Members use phones, and many are older or less used to apps. Design every screen at 390px first, then let it widen. Member screens never shrink their sizes to fit more content.

## 1. Sizes

- Body text 18px, secondary text 15px, page title 24px / 600. Nothing under 15px.
- Every tap target is at least 48px tall; the screen's main action is 56px and full width.
- At least 8px between neighbouring tap targets, so a shaky thumb does not hit the wrong one.
- Labels wrap to two lines rather than truncate.
- Icons are 24px and always have a text label beside or under them. No icon-only controls except the close button of a sheet.

## 2. Shell

- 16px side margins. No sidebar at any width.
- **Top bar,** 48px on `--ground`: a `#8c0001` logo tile 40px tall (logo 24px), the screen title, the theme switch, and at most one action.
- **Bottom bar** with four destinations, each a 24px icon over a 14px label: Home, Worship, Events, Me. The bar is 64px tall plus the safe-area inset. The current destination's label and icon are in `--text`; the others are `--muted`.
- **Wider than 640px:** the same layout in a centred column of at most 640px. The bottom bar stays.
- Guests see the same shell. Me becomes Sign in.

## 3. Home

Answers one question: "What's next for me?"

1. **The next service** in the member's own congregation: its name, time, and place. When check-in is open, a full-width 56px Check in button sits under it.
2. **This week's warta**, as a card that opens the full text in the member's language.
3. **Events** the member registered for, then events they can still join.

Each block shows at most 3 items, with a "See all" link. Guests see the same screen without the personal blocks (no registered events and no Check in button).

## 4. Flows

- One task per screen. A long form is split into short steps with a "Step 2 of 3" line in words.
- The back button always returns to where the member came from, at the same scroll position.
- After an action, the screen says what happened in a toast, in plain words ("You are checked in for Sunday Service 09:00").
- Check-in for a family: one screen lists the member, their spouse, and their children, all selected by default, with one Check in button.
- Never ask a member to type something the app already knows.
