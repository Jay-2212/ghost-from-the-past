---
inclusion: fileMatch
fileMatchPattern: ["extension/**/*.html", "extension/**/*.css", "extension/icons/**"]
---

# Ghost from the Past — Design Language

## Color Palette

- **Background**: `#F7F5F0` (off-white)
- **Text & Ink**: `#111` (near-black)
- **Accents**: None. Use off-white (`#F7F5F0`), white (`#FFFFFF`), black (`#111`), and greys (`#999`, `#CCC`, `#EEE`) for hierarchy, disabled states, and borders.
- **Status badge background**: `#111` (black)

## Typography

- **Font stack**: `-apple-system, "Segoe UI", Inter, Roboto, "Helvetica Neue", Arial, sans-serif` (system sans)
- **Line height**: 1.5 for readable text (description, long-form); 1.2 for compact labels
- **Weights**: Regular (400) for body, Medium (500) for labels/buttons, Semibold (600) for headings
- **Sizes**: 12px (captions), 13px (small labels), 14px (body), 16px (popup title), 18px (page headings)

## Spacing

- **4px grid**: all margin and padding increments are multiples of 4px (4, 8, 12, 16, 20, 24, 32, …)
- **Generous spacing**: prefer 16–20px between sections, 8–12px between related elements

## Shapes

- **Squircle cards**: border-radius `14px` (rounded rectangular with soft corners)
- **Pills (badges, buttons)**: border-radius `999px` (fully rounded, max value)
- **Standard buttons**: border-radius `12px`
- **Outlines**: 1.5px solid `#111`

## Interactive States

- **Hover**: background fill `#111` (black), text color `#F7F5F0` (off-white)
- **Focus-visible**: 2px offset outline in `#111` (outline-offset 2px for clarity)
- **Disabled**: grey text `#999` on `#EEE` background (no interaction)
- **Active**: same as hover, or darker grey `#333` background

## Tone of Copy

- Friendly-spooky but calm
- Examples: "Haunting", "Paused", "The ghost remembers 12 pages today", "Queued for sync"
- Avoid urgency; encourage user agency

## Logo & Mark

- **Bedsheet ghost icon** (`extension/icons/ghost.svg`):
  - Viewbox 128×128
  - Off-white fill (`#FFFFFF`), 1.5px black stroke scaled for legibility
  - Rounded squircle tile background
  - Central bedsheet ghost: draped sheet over head, rounded dome top, flared sides, wavy/scalloped hem (3–4 soft folds), two simple oval eye holes (white/negative space)
  - No mouth or tiny one; cute-spooky aesthetic
  - Must remain legible at 16px (thick shapes, simplify details)

## Export Standards

- **PNG**: 16×16, 32×32, 48×48, 128×128 via `scripts/build-icons.mjs` (no anti-aliasing artifacts)
- **SVG**: original at 128×128, scale gracefully

## Accessibility

- **Contrast**: all text ≥ 4.5:1 (WCAG AA minimum); `#111` on `#F7F5F0` is ~14:1 ✓
- **Keyboard navigation**: all interactive elements focusable, logical tab order
- **ARIA**: use `aria-label` for icon buttons, `aria-live="polite"` for status updates, `role="region"` for popup sections
- **Focus indicators**: visible at all times, sufficient size (≥ 2px), color contrast
- **Labels**: all form inputs have `<label>` or `aria-label`

## Component Guidelines

### Popup (320px wide)
- Bedsheet ghost mark top-left, "Ghost from the Past" title
- Large status pill ("Haunting" / "Paused") with generous padding
- Key stats as a card: "Pages remembered today: N", "Queued: N", "Last sync: 3 min ago"
- Button group: **Pause / Resume**, **Sync now**, **Settings** (squircle buttons, 12px radius, black outline)
- If unconfigured: "Connect your Worker" friendly card with link to options

### Options Page
- Sections with 16px padding, off-white background cards
- Form fields: 12px label, 14px input with black outline, password field with toggle show/hide
- Textarea for blocklist: monospace font, 100% width, grey background
- Buttons: "Test connection", "Save", "Reset to defaults" (12px radius)
- Recently remembered list: compact, titles only, grey text for dates

### Status Badge
- Empty text when actively haunting
- `⏸`-like text "off" when paused
- Background: `#111` (black)
- Pill shape (999px radius), 8px padding
- Floating top-right of icon or integrated in popup

## Code Standards for CSS

- Mobile-first: define base styles, then media queries for larger screens
- Use CSS Grid for layouts (gap: 16px)
- Use flexbox for component layout (gap: 8px for tight, 12px for loose)
- No CSS-in-JS; all styles in `*.css` files
- Avoid heavy shadows; prefer thin outlines
- Smooth transitions: `transition: background 0.15s ease-in-out` (optional, keep minimal)
