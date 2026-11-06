S8 follow-up (Kiro S8b). Hark checked your S8 edits against the code and the live extractor run. Small targeted fixes only; never print or commit secrets; no deploy, no git.

1. extension/lib/extractors/github.js, repo branch:
   a. The live run now extracts the description ("A standalone version of the readability lib") but returns it only in title/excerpt. Also put it in meta as `description` (meta: { repo, stars, topics, description }), capped to 300 chars.
   b. Tighten the suffix regex: `/\s*-\s+[^\/]+\/[^\s]+$/` can eat a real description containing " - " and a slash. Use something that only matches an owner/repo token, e.g. `/\s+-\s+[\w.-]+\/[\w.-]+$/`.
   c. If the remaining text is ONLY GitHub boilerplate (e.g. "Contribute to owner/repo development by creating an account on GitHub.") treat the description as empty. Your current regex requires a leading ". " so that case slips through.
   Extend the existing github test in extension/test/pipeline.test.mjs for b and c and for meta.description.
2. tests/extractors/live.mjs: the "news" case expects https://www.bbc.com/news/world (a SECTION page) to be news-article, which is now correctly wrong. Replace it with two cases:
   - { name: 'news', url: 'https://www.bbc.com/news/articles/cmn04705rd8jo', kind: 'news-article', keyFields: ['published', 'title'] }
   - { name: 'news-section', url: 'https://www.bbc.com/news/world', kind: 'article', keyFields: ['title'] } (a section page must fall through to the generic extractor, kind "article").
   Check the pass logic still works for both (title counts via result.title).
3. worker/src/index.ts: the top-level 500 handler returns `detail: (e as Error)?.message` to the client. Remove `detail` from the response body (keep the console.error message-only log). Update any worker test that asserts on detail, if one exists.

Run `cd extension && npm test` and `cd worker && npx vitest run` and make sure both pass. If the same fix fails twice, stop and say so. End with a list of edits (file + one line each).
