// Ghost from the Past — every user-facing sentence in one place (ES module, no dependencies).
// Voice: a friendly bedsheet ghost. A little mischief, never at the cost of clarity or trust:
// plain words for anything about privacy, and every error says what happened and what to do next.
// Keep identifiers the e2e tests look for ("Connected", "Last sync:", "Sync hiccup", "page(s)").

const pages = n => `${n} page(s)`;

export const S = {
  // ---------- errors (each one ends with something to do) ----------
  err: {
    notConnected: "The spirits can't reach your Worker. Open Settings and connect your Worker.",
    badUrl: "That address looks haunted — in a bad way. Paste the full https:// URL of your Worker and try again.",
    notGhostWorker: "Something answered, but it isn't our ghost. Check the address for typos and try again.",
    noSecretOnWorker: 'Your Worker is missing its secret spell. Add it in Cloudflare (Settings → Variables and Secrets), then try again.',
    workerOutdated: 'This Worker is an old ghost. Redeploy it from the Deploy to Cloudflare button, then try again.',
    verifyFailed: status => `Boo — Worker verification failed (${status}). Redeploy the Worker, then try again.`,
    cannotProve: "That Worker doesn't know the secret handshake, so nothing was sent. Check the address, or paste the secret you set on the Worker.",
    secretMismatch: "The Worker is awake, but your secrets don't match. Paste the same GHOST_SECRET you set on the Worker into Settings.",
    secretRejected: 'Boo — the Worker turned your secret away (401). Paste the matching GHOST_SECRET into Settings, then press Sync now.',
    workerStatus: status => `The spirits got ${status}, which is odd. Give it a minute, then press Sync now.`,
    unreachable: reason => `The spirits can't reach your Worker (${reason}). Check the URL in Settings and try again.`,
    unreachableUrl: (url, reason) => `The spirits can't reach ${url} (${reason}). Check the URL and try again.`,
    unexpected: reason => `A little poltergeist glitch (${reason}). Try again; if it keeps happening, reload the extension.`,
    forgetSite: "That site refuses to be ghosted. Close and reopen the popup, then try again.",
    copyFailed: 'The clipboard got spooked. Select the text and copy it by hand.',
  },

  // ---------- popup ----------
  popup: {
    remembering: 'Remembering',
    paused: 'Paused',
    pause: 'Pause',
    resume: 'Resume',
    syncNow: 'Sync now',
    syncing: 'Syncing…',
    lastSync: (ago, count) => `Last sync: ${ago}${count ? ` · ${pages(count)}` : ''}`,
    lastSyncNever: 'Last sync: never',
    syncProblem: msg => `Sync hiccup: ${msg}`,
    thisSite: host => `This site: ${host}`,
    noSite: 'Nothing haunts this page — it is never remembered.',
    siteBlocked: (pattern, removedCount) => `Won't remember ${pattern}. Poof — removed ${Number(removedCount) || 0} local page(s); ask your AI to "forget ${pattern}" to clear older memories.`,
    undo: 'Undo',
    undone: 'Undone. Poof — remembering that site again.',
  },

  // ---------- popup ghost guide ----------
  guide: {
    notConfigured: 'Boo. Start by connecting your Worker. Tap "Set up my ghost" below.',
    error: 'The spirits are tangled. Open Settings to check your Worker, then tap Sync now.',
    paused: 'Paused. The ghost is napping. Tap Resume to start remembering again.',
    waiting: n => `${n} page(s) are rattling. Tap Sync now to send them to your Worker.`,
    offLimits: 'Nothing haunts this page yet. It is never remembered — read on elsewhere.',
    quiet: "All quiet in the crypt. Keep reading and I'll remember it, only for you.",
    synced: n => `Remembered ${pages(n)}. It'll haunt you later — ask your AI.`,
    syncedNone: 'Nothing new to haunt. Everything is up to date.',
  },

  // ---------- options ----------
  options: {
    notConnected: 'Not connected',
    syncLine: (ago, queued, sent) => `Last sync ${ago} · ${queued} waiting · ${sent} sent`,
    recentEmpty: 'Nothing haunts here yet. Read something and I will remember it.',
    recentSynced: 'synced',
    recentQueued: 'queued',
    show: 'Show',
    hide: 'Hide',
    showSecretLabel: 'Show secret',
    hideSecretLabel: 'Hide secret',
    revealSnippet: 'Reveal secret',
    hideSnippet: 'Hide secret',
    testing: 'Testing the connection… rattling chains…',
    secretCopied: 'Secret copied. Shhh.',
    connected: pagesN => `Connected. ${pages(pagesN)} remembered so far — nicely haunted.`,
    saved: pagesN => `Saved and connected. ${pages(pagesN)} remembered so far — nicely haunted.`,
    connectFirst: 'No ghost to talk to yet. Connect your Worker first, then try again.',
    mcpCopied: 'MCP URL copied. Paste it into your AI client to summon me.',
    snippetCopied: 'Config copied (secret inside). Paste it into your MCP client settings.',
    privSaved: 'Saved.',
    defaultsRestored: 'Defaults restored from the crypt. Press Save to keep them.',
    syncing: 'Sending pages through the ether to your Worker…',
    synced: n => (n ? S.guide.synced(n) : S.guide.syncedNone),
    queueCleared: 'Local queue exorcised. Pages already in your Worker stay put.',
    confirmClear: 'Banish everything waiting to sync? Memories already in your Worker stay there.',
  },

  // ---------- onboarding ----------
  onboarding: {
    checking: 'Checking your Worker… knocking on the crypt…',
    done: (url, n) => `Connected to ${url} · ${pages(n)} remembered so far. Boo!`,
    secretCopied: 'Secret copied. Shhh.',
    deployCopied: 'Secret copied. Whisper it into GHOST_SECRET on the Cloudflare page, then press Deploy there.',
  },
};