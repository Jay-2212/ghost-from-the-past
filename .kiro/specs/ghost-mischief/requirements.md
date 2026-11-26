# Ghost Mischief — Requirements

Goal: an interface with a little mischief in it (a ghost that guides, errors that are kind and a bit funny) that still tells the user what to tap next. Keep the off-white/black design and the bedsheet-ghost identity. Tasteful, not cheesy.

**M1. Voice**
- M1.1: WHEN the popup, Settings or onboarding pages show an empty state, a loading state, a success or an error THEN the system SHALL use ghostly copy from one module, `extension/lib/strings.js`.
- M1.2: EVERY error message SHALL state what happened and what the user should do next (check the URL, paste the secret, redeploy, press Sync now).
- M1.3: Copy SHALL never hide the cause: status codes and network reasons stay in the message.
- M1.4: Strings that tests rely on (`Last sync:`, `page(s)`, `Connected`, `Won't remember`, `All done`) SHALL stay stable.

**M2. Ghost guide (popup)**
- M2.1: The popup SHALL show a small inline-SVG ghost and one hint line that names the next step.
- M2.2: WHEN the extension is not configured THEN the hint SHALL tell the user to connect their Worker and point at "Set up my ghost".
- M2.3: WHEN configured THEN the hint SHALL reflect state in this order: sync error, paused, just synced, pages waiting, page not capturable, all quiet.
- M2.4: The ghost SHALL bob gently, and SHALL NOT animate under `prefers-reduced-motion: reduce`.
- M2.5: The ghost SHALL be `aria-hidden`; the hint SHALL be real text in a polite live region.
- M2.6: No new dependencies, no remote assets.

**M3. Polish and accessibility**
- M3.1: Every interactive element SHALL have a visible `:focus-visible` state.
- M3.2: Icon-like or ambiguous buttons (Show, Copy) SHALL have `aria-label`s that contain their visible text.
- M3.3: Inputs SHALL be bound to labels with `label[for]`; read-only code boxes SHALL be named.
- M3.4: Text colours SHALL meet WCAG AA against the paper background (muted/faint text at least 4.5:1).
- M3.5: Inline styles SHALL move into stylesheets.

**M4. Out of scope (must not change)**
- Behaviour, manifest permissions, the security model, storage keys, the Worker API.

**M5. Verification**
- M5.1: Unit tests SHALL check that every error string contains an instruction and that stable strings did not drift.
- M5.2: Worker, extension and e2e suites SHALL be run; anything that cannot run SHALL be reported.
- M5.3: The release zips SHALL be rebuilt and contain the new files.
