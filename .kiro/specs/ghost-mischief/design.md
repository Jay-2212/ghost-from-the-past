# Ghost Mischief — Design

## Strings module
`extension/lib/strings.js` exports one object `S` with groups `err`, `popup`, `guide`, `options`, `onboarding`. Values are strings or small functions (`S.err.unreachable(reason)`). It is a plain ES module with no imports, used by `background.js`, `popup.js`, `options.js` and `onboarding.js`. Static copy in the HTML files is the initial text only; JS overwrites it.

Error shape: `what happened (cause) + what to do`. Example: `The spirits can't reach your Worker (Failed to fetch). Check the URL in Settings and try again.`

## Popup guide
Markup: `div.guide > svg.guide-ghost[aria-hidden] + p#guideText[role=status][aria-live=polite]`. `render()` in `popup.js` picks the hint:

| State | Hint |
|-------|------|
| not configured | `S.guide.notConfigured` (card gets `.pointing`) |
| `lastError` | `S.guide.error` |
| paused | `S.guide.paused` |
| just pressed Sync now | `S.guide.synced(n)` or `syncedNone` |
| queued > 0 | `S.guide.waiting(n)` |
| page not capturable | `S.guide.offLimits` |
| otherwise | `S.guide.quiet` |

`justSynced` lives in popup memory only; no storage keys change.

## Motion
`@media (prefers-reduced-motion: no-preference)` enables the `bob` keyframes on `.guide-ghost`. A `reduce` block sets `animation: none` and `transition: none` on everything in the shared stylesheet.

## Accessibility and polish (`ui.css`)
- `:focus-visible`: 3px ink outline with a paper halo, so it shows on both light and solid buttons.
- Buttons get `min-height: 38px`.
- `--faint` darkened to `#55524C` (same as `--muted`, about 7:1 on `#F7F5F0`).
- Options: `.nomargin`, `.narrow` classes replace inline styles; `.row` wraps on narrow widths.
- Show/Copy buttons: `aria-label` updated together with their text when toggled.

## Tests
`extension/test/strings.test.mjs`: error strings contain an instruction verb; stable fragments the e2e script matches; guide strings have no `undefined`. `tests/e2e/run.mjs` accepts `Sync hiccup` where it accepted `Sync problem`.

## Risks
- Playful copy can bury the instruction: the unit test guards that.
- e2e could not run in the authoring sandbox (Chromium missing `libatk`); the popup logic was smoke-tested in jsdom instead.
