# s15c: restore the mischief (balanced copy)

s15b over-corrected: extension/lib/strings.js lost all ghostly wit, which was the whole point of the Kiroween brief ("an interface with a little mischief in it... If I smile and still know what to tap next, you've won."). The real problem was only surveillance-sounding copy in a privacy tool.

docs/reviews/s15c-meta-copy-deck.js is a rewrite of strings.js by Meta muse-spark with tasteful ghost wit restored. Use it as the copy source:
1. Merge its string VALUES into extension/lib/strings.js, keeping every key/signature/placeholder and the stable test strings. Fix anything clumsy or redundant (e.g. "Nothing haunts this page yet. It is never remembered" for a blocked page is contradictory: blocked pages should say something like "This page stays unhaunted. I never remember it." ). Success after sync should read like "Remembered N page(s). They'll haunt your AI later." Keep it tasteful, max one joke per string, every error still says plainly what to do next.
2. Make sure the HTML-hardcoded copy (popup.html, options.html, onboarding.html) has matching light mischief where s15b flattened it (ghost guide hint, empty state, status pill may say "Haunting" again only if it's clear; otherwise "Remembering").
3. Change the s15b "creepy words" test: allow haunt/spook/spirits/Boo; ban only surveillance phrasing (watching you, spying, stalk, tracking you, following you, I see everything). Keep the "every error contains an instruction" test.
4. npm test all green; rebuild zips via scripts/build-chrome.mjs and build-firefox.mjs; cp chromium zip byte-for-byte to release/ghost-from-the-past-extension-v1.0.0.zip; verify with cmp and unzip -l.
5. Update .kiro/specs/ghost-mischief/tasks.md, the s15 entry in docs/kiro-logs/README.md (mention s15b review + s15c copy round), README credits (copy deck by Meta muse-spark, integrated by Kiro).
Do NOT commit. End with test counts and 6 example strings.
