Session S12: Firefox build. Keep everything uncommitted.

Goal: produce a Firefox (AMO) package of the extension without changing the Chrome build.

Steps:
1. Read extension/manifest.json and the extension code.
2. Write scripts/build-firefox.mjs. It copies extension/ (minus node_modules, test, package files) to dist/firefox/ and writes a Firefox manifest there:
   - background: {"scripts": [<the service worker file>], "type": "module" if the worker is an ES module}
   - browser_specific_settings.gecko: id "ghost-from-the-past@jay-2212.github.io", strict_min_version that supports MV3 and the APIs used
   - data_collection_permissions: required [] or the right value per current AMO policy. The data goes only to the user's own Worker; decide honestly.
   - drop any Chrome-only keys or permissions Firefox rejects.
   Then it zips the result to release/ghost-from-the-past-firefox-v1.0.0.zip.
3. Audit the code for Chrome-only APIs (chrome.offscreen, chrome.sidePanel, service-worker-only globals, etc.). Add minimal feature-detected fallbacks so the Firefox build loads and works. Do not break Chrome.
4. Run `npx web-ext lint -s dist/firefox` (install web-ext into a temp dir if needed, not the repo) and fix all errors. Warnings are OK if explained.
5. Also write scripts/build-chrome.mjs that zips the Chrome/Edge build to release/ghost-from-the-past-chromium-v1.0.0.zip (excluding node_modules/test).
6. Run extension npm test (36/36 must still pass).
7. Add a short "Firefox" note to README install section.
Print a summary: files changed, web-ext lint result, test results, and anything left.
