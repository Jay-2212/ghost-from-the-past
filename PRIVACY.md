# Privacy Policy: Ghost from the Past

Last updated: 2026-11-06

Ghost from the Past is a browser extension that keeps a searchable memory of the web pages you read. It sends that memory only to a Cloudflare Worker that you deploy in your own Cloudflare account. The developer runs no server and receives none of your data.

## What is captured

For each page you read, the extension records:

- the page's readable text, converted to markdown (site-specific extractors pick the main content)
- the page title and URL
- time on page: how long the tab was visible and focused
- when you first and last visited the page, and how many times

Some extractors also keep page metadata such as author or publication date when the page provides it.

## What is never captured

- **Incognito / private windows.** The extension does not run in incognito mode.
- **Blocklisted sites.** Sign-in and account pages, email and messaging, private documents and workspaces, AI chats, password managers, banking, payments and crypto, health portals, government/tax/ID sites, browser pages and private-network addresses are blocked by default. You can edit the blocklist in Options or block a site from the toolbar popup.
- **Anything while paused**, and anything before the extension is connected to your Worker.

## Redaction before upload

Before a page leaves your browser, the extension removes card numbers, API keys, tokens and private keys, SSN-like, Aadhaar-like and PAN numbers, and (by default, switchable in Options) email addresses. Credential-like URL parameters such as `token`, `signature` and `X-Amz-*` are stripped from stored URLs. Phone numbers and street addresses are not redacted.

## Where your data goes

- Captured pages are queued locally in the extension's storage (`chrome.storage.local`) and then sent over HTTPS to **your own Cloudflare Worker**, authenticated with a secret you generate.
- The Worker stores pages in your own Cloudflare D1 database (and Vectorize index, if you enable one) and uses Workers AI in your account to compute search embeddings.
- There is no developer server, no analytics, no tracking and no third-party sharing. Your AI assistant can read your memory only if you connect it to your Worker's MCP endpoint with your secret.

## How to delete your data

- Ask your AI assistant to use the `forget` tool to delete specific pages by id or URL.
- Use **Forget local queue** in Options to clear pages not yet synced.
- Delete the D1 database (and Vectorize index, if any) and the Worker in your Cloudflare dashboard to remove everything. Removing the extension deletes its local storage.

## Contact

Questions or concerns: open an issue at https://github.com/Jay-2212/ghost-from-the-past/issues.
