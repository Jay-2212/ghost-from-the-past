# Ghost Mischief — Tasks

## Phase 1: Copy
- [x] 1. Create `extension/lib/strings.js` with err / popup / guide / options / onboarding groups (M1.1)
- [x] 2. Route every `background.js` error through `S.err.*`; each says what to do next (M1.2, M1.3)
- [x] 3. Popup, Settings and onboarding use `S` for empty, loading, success and error text (M1.1)
- [x] 4. Keep test-relied-on fragments stable; change e2e `Sync problem` to `Sync (problem|hiccup)` (M1.4)

## Phase 2: Ghost guide
- [x] 5. Add the inline-SVG ghost and hint line to `popup.html` (M2.1, M2.5, M2.6)
- [x] 6. Pick the hint by state in `popup.js` (M2.2, M2.3)
- [x] 7. Bob animation with `prefers-reduced-motion` handling (M2.4)

## Phase 3: Polish
- [x] 8. Visible `:focus-visible`, button min-height, AA contrast (M3.1, M3.4)
- [x] 9. `aria-label`s on Show/Copy, named code boxes, inline styles moved to CSS (M3.2, M3.3, M3.5)
- [x] 10. Clipboard failures show a message instead of failing silently (M1.2)

## Phase 4: Verify and ship
- [x] 11. `extension/test/strings.test.mjs` (M5.1)
- [x] 12. Run worker + extension suites (M5.2)
- [x] 13. Run e2e: not runnable here (Chromium missing `libatk-1.0.so.0`); noted (M5.2)
- [x] 14. Rebuild chromium, firefox and extension zips; verify `lib/strings.js` inside (M5.3)
- [x] 15. README credits, `docs/kiro-logs` s15 entry and index
- [x] 16. Review round (S15b): Meta muse-spark review verified point by point; fixes for guide `justSynced` priority, `copySnippet` guard, aria units and `role=textbox`, dead strings removed, `.row.wrap` scoped to button rows, `siteBlocked` count and trailing space, and reassuring non-surveillance copy (test guards against "watching/haunt/spook"); suites green, zips rebuilt
- [x] 17. Copy round (S15c): Meta muse-spark copy deck (`docs/reviews/s15c-meta-copy-deck.js`) integrated by Kiro. Ghost wit restored in `strings.js` and light mischief in popup/options HTML; blocked pages read "This page stays unhaunted. I never remember it."; the copy test now bans only surveillance phrasing (watching you, spying, stalk, tracking you, following you, I see everything); zips rebuilt
- [x] 18. Run e2e and refresh popup screenshots (S15d): e2e run with the extracted system libs, 28/28 passed; new `shots/popup-ghost-guide.png` (first run) and `shots/popup-ghost-guide-queued.png`; other shots refreshed by the run
