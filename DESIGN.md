# Design

Design rules shared by every screen of the GRII app. Product facts and audiences are in `PRODUCT.md`; code rules are in `CLAUDE.md`. Where this file gives a number, use that number.

| File                            | Covers                                                                              |
| ------------------------------- | ----------------------------------------------------------------------------------- |
| `DESIGN.md` (this file)         | Densities, colour (light and dark), type, formatting, brand mark, languages, motion |
| `src/routes/(admin)/DESIGN.md`  | Staff shell, list, detail and settings screens, check-in and serving cover          |
| `src/routes/(member)/DESIGN.md` | Member shell, bottom bar, home, sizes for older users                               |
| `src/lib/components/DESIGN.md`  | Buttons, dialogs, sheets, toasts, selects, pills, icons, states                     |

Read this file and the file for the folder you are working in before any UI work.

Style: **framed sheet** (dealt by tasteskill, seed 1632897614). One tinted frame holds the navigation; the work sits on a sheet one tone step lighter. Depth comes from tone, never from shadows. Colour goes on data and on the one primary action, not on chrome.

## 1. Two densities, one system

One set of tokens and components serves two audiences. Every screen picks one density.

|                | Staff (`(admin)`)                | Member (`(member)`)                    |
| -------------- | -------------------------------- | -------------------------------------- |
| Main device    | Desktop or laptop, long sessions | Phone, quick visits                    |
| Body text      | 14px (`0.875rem`)                | 18px (`1.125rem`)                      |
| Secondary text | 12px                             | 15px                                   |
| Page title     | 22px / 600                       | 24px / 600                             |
| Touch target   | 32px controls, 48px rows         | 48px minimum, 56px for the main action |

All sizes are in `rem`, so OS text scaling works. Never set a pixel `font-size` on `html`. At 200% text size, layouts reflow and nothing is cut off or overlaps.

Breakpoints: phone up to 640px, tablet 641-1099px, desktop 1100px and wider.

## 2. Colour

### Light tokens

```css
:root {
	--ground: #f8f6f5; /* the frame: one low-chroma step of the brand hue */
	--surface: #ffffff; /* the sheet and cards */
	--raised: #f4f3f2; /* wells, settings panels */
	--active: #ebe8e7; /* active nav pill, selected row */
	--border: #e8e6e5;
	--rule: #f0efee;
	--control: #cdcbca;

	--text: #131416;
	--muted: #5d5f60;

	--brand: #8c0001;
	--brand-ink: #ffffff;
	--data: #1b6c80; /* the one chart hue */
	--focus: #8c0001;
	--tab: #8c0001; /* active tab underline */

	--positive: #1e7b4f;
	--pill-positive-bg: #dcfae5;
	--pill-positive-ink: #04250e;
	--negative: #c4242a;
	--pill-negative-bg: #ffedea;
	--pill-negative-ink: #831c1e;
	--warning: #92400e;
	--pill-warning-bg: #fffbeb;
	--pill-warning-ink: #92400e;
	--pill-neutral-bg: #ebe8e7;
	--pill-neutral-ink: #353736;
}
```

### Dark tokens

True neutral greys, no navy or slate. Surfaces separate by lightness alone.

```css
:root[data-theme='dark'] {
	--ground: #0f0f0f;
	--surface: #171717;
	--raised: #222222;
	--active: #2a2a2a;
	--border: #2e2e2e;
	--rule: #232323;
	--control: #4a4a4a;

	--text: #f2f2f2;
	--muted: #b4b4b4;

	--brand: #a3121a;
	--brand-ink: #ffffff; /* lifted from #8c0001 so the button reads on dark */
	--data: #4fb3c8;
	--focus: #f2f2f2; /* a red ring on dark would read as an error */
	--tab: #f2f2f2;

	--positive: #3fc07a;
	--pill-positive-bg: #172a1d;
	--pill-positive-ink: #3fc07a;
	--negative: #ef6b7e;
	--pill-negative-bg: #2c1a20;
	--pill-negative-ink: #ef6b7e;
	--warning: #e8a33c;
	--pill-warning-bg: #2b2111;
	--pill-warning-ink: #e8a33c;
	--pill-neutral-bg: #2a2a2a;
	--pill-neutral-ink: #d0d0d0;
}
```

Every text pair above passes 4.5:1 in both themes (checked by calculation).

- **Choosing a theme:** the default follows the OS (`prefers-color-scheme`). The user can override it with Light, Dark, or System in their settings. The choice is stored in a cookie so the server renders the right theme and the page never flashes.
- **The logo field** stays `#8c0001` in both themes. Only the button colour lifts.
- **Photos and the QR code** keep a white backing in dark mode so they scan and read correctly.

### Wiring

The tokens go in `src/app.css` under Tailwind 4 `@theme`. shadcn-svelte variables point at them: `--background` → `--surface`, `--foreground` → `--text`, `--primary` → `--brand`, `--primary-foreground` → `--brand-ink`, `--muted-foreground` → `--muted`, `--border` → `--border`, `--input` → `--control`, `--ring` → `--focus`, `--destructive` → `--negative`.

### Where the brand red goes

`#8C0001` is the only official colour. It appears in four places only: the logo field, the one filled primary button per screen, the active tab underline (light theme), and the focus ring (light theme).

The brand red never goes on numbers, chart marks, or status. Red on a figure means "bad" (`--negative`), and the two must not be confused. Chart data uses `--data`.

### Rules

- Under 3% of a staff screen's pixels carry colour. A member screen may use brand red on its one main action, such as a full-width Check in button.
- Status uses pale pills with dark text of the same hue (light), or a hue on a dark tint of itself (dark). Never a saturated fill with white text.
- A change is coloured by good or bad, not by up or down. A zero change, or one with nothing to compare, is grey.
- No gradients, glows, glass, or blur. No violet or indigo. No dark or red sidebar in the light theme.

## 3. Type

- **Face:** IBM Plex Sans, weights 400, 500, 600. IBM Plex Mono only for IDs and codes (member numbers, claim codes, QR fallback codes).
- **Chinese:** Plex has no CJK glyphs. Do not load a CJK web font; it is several megabytes. Use system faces:
  - `:lang(zh-Hans)`: `"PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif`
  - `:lang(zh-Hant)`: `"PingFang TC", "Microsoft JhengHei", "Noto Sans TC", sans-serif`
- **Line height:** 1.5 for Latin text, 1.7 for Chinese.
- **Sizes:** each density uses the sizes in §1, plus 28px for a headline figure. Nothing over 32px. Nothing under 12px (staff) or 15px (member).
- **Figures:** `font-variant-numeric: tabular-nums` on every table, total, count, and time. Numbers in columns are right-aligned.
- **Case:** sentence case everywhere. No uppercase labels, no letter spacing.
- **Weights:** headline figures at 400; the 600 goes on titles, labels, and the active tab.

## 4. Formatting

Never hand-build a number or date string.

- **Money** is rupiah with `.` as the thousands separator and no decimals, in every locale: `Rp 1.250.000`. Always format with the `id-ID` locale, whatever the UI language, because `en` and `zh` print `IDR 1,250,000`:
  ```ts
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });
  ```
  Put this in one shared formatter, not in each component.
- **Other numbers** (counts, attendance) use the UI locale with `Intl.NumberFormat(locale)`.
- **Times** are 24-hour ("09:30"). Dates in lists say "Today" and "Yesterday", then the date ("Sun 3 Nov"), in the UI locale.
- A missing value is a grey dash. A real zero prints as zero.

## 5. Brand mark

The logo (`static/brand/grii-logo-source.png`) is white, so it sits only on a `#8c0001` field. Each shell file says where the field goes. On login and first-run screens the logo sits on a `#8c0001` panel; that is the one place a large field of brand colour is allowed.

Never put the logo on white, grey, or a photo. Never recolour it, stretch it, or add effects. Its alt text is "GRII".

## 6. Writing for three languages

- Every string comes from Paraglide. Leave about 30% extra room: Indonesian runs longer than English.
- Never put text inside an image, and never build a sentence by joining translated fragments.
- Each page sets `lang` to the current locale so the right Chinese face and line breaking apply.
- Voice: formal, informational, concise (`PRODUCT.md`). Use the church's own terms (Kebaktian, Warta, Persembahan) in every locale where they are names.

## 7. Motion

Motion is feedback only. Hover, press, and focus states, menus and sheets opening, and toasts arriving, at 150-200ms with transform and opacity only. Nothing performs an entrance. Under `prefers-reduced-motion`, sheets and dialogs appear without travel.

## 8. Never

- Gradients, shadows on resting cards, glass, glows, emoji in UI copy.
- Icons in tinted circles on KPIs or cards, sparklines, rainbow charts.
- Uppercase tracked labels, zebra tables, pagination under a short overview list.
- Browser `alert()`, `confirm()`, `prompt()`.
- Fake data in shipped screens, such as invented member counts or testimonials (`PRODUCT.md`).
- Member or finance data cached for offline use (`PRODUCT.md`).
- The page scrolling sideways at any width.
