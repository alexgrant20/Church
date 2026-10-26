# Components

shadcn-svelte components live in `src/lib/components/ui/` and are restyled with the tokens in the root `DESIGN.md`. GRII's own reusable components live in `src/lib/components/`. Sizes below are given as staff / member.

## 1. Components

- **Buttons:** 32px / 48px tall, with a 6px radius. One filled `--brand` primary per screen. Secondary: `--surface` with a 1px `--control` border. Tertiary: text only. Buttons are as wide as their label, never a fixed width, so long Indonesian labels fit. On a member phone screen, the main action is full width.
- **AlertDialog:** every destructive or irreversible confirmation. The title names the object ("Delete branch GRII Kelapa Gading?"). The confirm button says what it does ("Delete branch"), never "OK".
- **Dialog:** short forms on desktop. On phones, use a bottom Sheet instead.
- **Sheet:** the phone menu, filters, and pickers. Opens from the bottom, with a handle and a close button.
- **Toast (svelte-sonner):** confirms an action that already happened ("Saved", "Checked in: Budi Santoso"). Bottom centre on phones, above the member bottom bar; bottom right on desktop. Errors stay visible until dismissed.
- **Searchable select (combobox):** server search, debounced 250ms, infinite scroll, arrow keys and Enter. On phones it opens as a full-screen sheet with the search box focused.
- **Inputs:** 40px / 48px tall, with the label above the field. No placeholder standing in for a label. A field's limit (for example, password rules) stays visible under it and is tied to it with `aria-describedby`.
- **Status pill:** 20px / 24px tall, using the pill pairs in the root `DESIGN.md`. It never shrinks or wraps.
- **Icons:** one outline set (lucide, which shadcn-svelte uses), 16px / 24px, in `--muted`. Never inside a coloured circle or square. An icon-only button always has an `aria-label`.
- **Theme switch:** Light, Dark, or System, as a three-option segmented control in settings.

## 2. States

Every block has these, and each one is built and checked:

- **Loading:** the final layout, with grey bars at each value's real size. No spinner over the page, no shimmer, no layout shift when data arrives.
- **Empty:** the block keeps its frame and heading, and adds one sentence plus the next action ("No members in this group yet. Add member").
- **Error:** inside the failed block. One sentence saying what failed, and a Retry button. Never a full-page error for one failed block.
- **Disabled:** stays readable, and says why it is disabled.
- **Focus:** a 2px `--focus` ring with a 2px offset on every interactive element, visible with the keyboard.
- **Hover and press:** a one-step tone change (`--raised`, then `--active`). No colour change on hover.
