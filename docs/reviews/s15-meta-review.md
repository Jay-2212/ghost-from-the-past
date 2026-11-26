# s15 independent review (Meta muse-spark-1.3-contributor)

1. `extension/popup.js` — `justSynced` never cleared / wrong priority:
```js
else if (justSynced !== null) guide(...)
else if (st.queued > 0) guide(...)
```
After one successful sync the guide sticks on `Remembered N` forever, even when new pages queue. Fix: reset `justSynced=null` on `refresh()` start / tab change, and check `queued>0` before stale `justSynced`, or expire after one render.

2. `extension/options.js` — `copySnippet` missing guard that `copyMcp` has:
```js
if (!s.workerUrl) return say('mcpToast', S.options.connectFirst); // copyMcp only
await copy(snippet(s.workerUrl,s.secret,true),...)
```
Unconnected click copies `undefined`/placeholder with secret `undefined`. Fix: same `if(!s.workerUrl||!s.secret)` guard as `copyMcp`.

3. `extension/options.html` — units hidden from AT:
```html
<span aria-hidden="true">seconds on</span>
```
Label is `Only remember pages...` so SR hears no units. Fix: remove `aria-hidden`, or add `aria-label="Only remember pages I spend at least, in seconds"` / `aria-describedby`.

4. `extension/options.html` — wrong role:
```html
<div ... id="mcpUrl" role="textbox" aria-readonly="true" tabindex="0">
```
`textbox` implies editable. Fix: use plain `div` with `tabindex="0"` + `aria-label`, or `role="region"`/`status`, not `textbox`.

5. `extension/lib/strings.js` (new import) — dead / drift strings + unproven file:
`S.popup.tagline/connectTitle/connectBody/setup/settings/forgetSite/todayLabel/queuedLabel`, `S.options.subtitle/statusLoading/copySecretLabel` are defined but `popup.html/options.html` still hardcode text and `popup.js/options.js` never set them. Fix: either wire them up or delete; and confirm `lib/strings.js` is actually committed — `background.js: import {S}` will kill the whole SW if missing.

6. `extension/options.css` — overly broad:
```css
.row { flex-wrap: wrap; }
```
Hits every popup/options/onboarding row, will wrap popup buttons at 300px. Fix: scope e.g. `.privacy-row{flex-wrap:wrap}` or test narrow popup.

7. `extension/popup.js` — fragile count + trailing space:
```js
S.popup.siteBlocked(r.pattern, Object.keys(r.removed||{}).length)
// `Won't remember ${pattern}... `
```
If `removed` is array/number shape changes count is 0; string has trailing space. Fix: confirm contract from `background.js` (`forget-site`) and make `siteBlocked(pattern, n:number)`, trim string.

8. Trust/creepy microcopy — must fix, privacy tool must not say `watching/haunt`:
* `onboarding.html`: `I'll be watching you.` (+ parenthetical doesn't save it)
* `popup.js guide.paused`: `when you want me watching again`
* `S.guide.synced/synced`: `It'll haunt you later.`
* `onboarding.html`: `only slightly haunted`, `S.popup.noSite/offLimits: Nothing haunts...`
Fix: `I'll remember what you read — only for you.` / `Tap Resume to start remembering again.` / `Remembered N page(s). Ask your AI about them later.`

9. Cheesy error voice obscures action:
* `workerOutdated: bit of an antique`
* `unreachable/unreachableUrl: The spirits can't reach...`
* `unexpected: Something spooky happened`
* `verifyFailed: ghost check failed`
Fix: plain: `This Worker is out of date. Redeploy it from [Deploy page], then try again.` / `Could not reach your Worker (${reason}). Check URL in Settings and try again.` / `Something went wrong (${reason})...` / `Worker verification failed...`

10. `S.err.forgetSite`: `Reload this popup and try again.` — users can't reload a popup. Fix: `Close and reopen the popup and try again.`

11. Cheesy status jokes to strip:
* `popup.lastSyncNever: never (I can wait)`
* `guide.notConfigured: Boo.`
* `options.connected: The ghost is in.`, `secretCopied: Keep it between us.`, `privSaved: stay unhaunted.`, `recentEmpty: Nothing haunts...`
Fix: `Last sync: never` / drop `Boo.` / `Connected. N page(s) remembered so far.` / `Secret copied.` / `Saved.`
## Kiro response

1. Valid. Queued pages now take priority over a stale `justSynced`, which is cleared when the queue guide shows or when pause is toggled.
2. Valid. `copySnippet` now has the same `!workerUrl || !secret` guard as `copyMcp`.
3. Valid. Removed `aria-hidden`; the unit now reads "seconds on them" so screen readers hear it.
4. Valid. Removed `role="textbox"` and `aria-readonly` from `#mcpUrl` and `#mcpSnippet`; they keep `tabindex` and `aria-label`.
5. Valid for the dead strings (popup tagline/connect*/setup/settings/forgetSite/today/queued labels and options subtitle/statusLoading/copySecretLabel): deleted, and a scan confirms every remaining key is used. The "may not be committed" worry is real until the commit: `lib/strings.js` is untracked and goes in with the s15 commit, and it is inside the rebuilt zips.
6. Valid. `.row { flex-wrap }` is now `.row.wrap`, applied only to the four button rows in `options.html`; popup and onboarding rows are unaffected.
7. Partly valid. The contract is fine: `ghost:forget-site` returns `removed` as an object keyed by URL, so the count was right. Made it defensive (count 0 for non-objects), `siteBlocked` takes a number, and the trailing space is gone.
8. Valid. "I'll be watching you", "watching again", "haunt you later", "slightly haunted", "Nothing haunts…" and the "Haunting" status are replaced (for example "I'll remember what you read, only for you.", "Remembering"). A new test fails on watching/haunt/spook/spirits/stalk in any string.
9. Valid. `workerOutdated`, `unreachable*`, `unexpected` and `verifyFailed` use plain wording and still say what to do next.
10. Valid. Now "Close and reopen the popup, then try again."
11. Valid. Removed "(I can wait)", "Boo.", "The ghost is in.", "Keep it between us.", "stay unhaunted", and the haunting empty state. Kept the mild mischief that carries no trust risk ("Set up my ghost", "Start reading").
