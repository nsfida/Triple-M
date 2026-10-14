# Triplem VIP SEO and GEO operations

Last reviewed: 2026-10-14

## Purpose

The repository contains the source-level SEO and generative-engine discovery layer. Search visibility is not a one-time code state. It also depends on the deployed HTTP response, crawl access, performance, indexing, external authority, and the usefulness of the public content.

## Before deployment

Run `npm run verify`, `npm run seo:prepare`, and `npm run build:production`. The preparation command rebuilds `sitemap.xml` from canonical, indexable public HTML pages and runs the source audit. It verifies that sitemap URLs exactly match the indexable HTML set, checks canonical origin/uniqueness, validates the crawler policy for Google/Bing and supported answer engines, verifies Markdown discovery links, and audits the human-maintained `humans.txt`. `noindex` pages are excluded automatically. The sitemap uses explicit content-modification metadata; it does not substitute deployment/file timestamps for meaningful content freshness. Do not publish if a source audit fails. CI uses the current Node.js 24 line and maintained GitHub Actions releases.

## After production deployment

Run `npm run seo:postdeploy`. It performs a production audit of `robots.txt`, the sitemap, `llms.txt`, `llms-full.txt`, `humans.txt`, the IndexNow key, page status/content type/final URL, `X-Robots-Tag`, HTML robots directives and exact canonical tags. Discovery files and crawl-critical resources receive a readiness retry budget; individual pages use a smaller retry budget and are audited in bounded concurrent batches so the job is less likely to time out during a short slowdown. The live audit remains a release gate: persistent or genuine crawl/indexability errors still fail and must be fixed. After the audit passes, IndexNow submission is attempted as a non-blocking notification channel. If IndexNow itself is unavailable, the verified SEO audit remains green; the log warns that the URL notification was not confirmed, and it can be retried with `npm run seo:indexnow`.

The IndexNow key file in the repository must remain publicly reachable at the production root. Do not place private credentials in the repository.

## Google Search Console

Verify the production domain, submit `https://triplem.vip/sitemap.xml`, monitor indexing and Core Web Vitals, inspect important URLs after major releases, and review Search performance. Use Google's Generative AI performance reporting where available to understand pages and queries appearing in AI Overviews and AI Mode. Treat observed search behavior as evidence for future content work rather than adding speculative keywords.

## Bing Webmaster Tools

Verify the site, submit the same sitemap, keep IndexNow functioning, and review the AI Performance report for citations, cited pages, and grounding queries across Bing/Copilot experiences. As of 2026-10-14, Bing has also announced a Topics Portfolio beta for grouping AI-search grounding queries into themes; use it where available to identify content clusters worth strengthening. Treat citations and topic trends as observational evidence—not rankings, causal proof, or a guarantee that a particular edit will improve visibility. Official references: [Bing AI Performance report](https://www.bing.com/webmasters/help/ai-performance-9f8e7d6c) and [Topics Portfolio beta announcement](https://blogs.bing.com/webmaster/2026/10/introducing-topics-portfolio-beta-in-ai-performance/).

## ChatGPT and answer engines

`OAI-SearchBot` must be able to crawl public canonical content. `ChatGPT-User` is permitted for user-initiated retrieval. The same public discovery policy explicitly covers `PerplexityBot`, `Perplexity-User`, `Claude-SearchBot` and `Claude-User`. The CDN, WAF or hosting layer must not silently block allowed crawlers. `llms.txt`, `llms-full.txt`, `humans.txt`, and Markdown mirrors are supplementary discovery/context aids, not official ranking factors or prerequisites; canonical HTML remains the authoritative public page. The source audit checks these links for drift so a stale retrieval index does not silently point to missing files. No special GEO-only markup or AI-specific file guarantees inclusion. Keep technical crawl/indexability fundamentals and useful, original content as the priority.

Training crawler policy is independent from search visibility. `GPTBot`, `ClaudeBot` and Google-Extended are not substitutes for their corresponding search/retrieval paths. Google-Extended can affect Gemini model development and grounding in certain Google products but does not control Google Search inclusion or ranking. If the owner later wants a different training policy, change it intentionally rather than treating training access as an SEO requirement.

## International pages

Regional pages provide genuine currency and product context and use reciprocal `hreflang`. They do not claim that currency availability equals local tax filing, statutory compliance, certification or professional advice. When a material local rule is discussed, prefer the official authority and review the page when the rule changes.

## Content quality

Prioritize original product workflows, factual feature explanations, useful examples, visible authorship, update dates and honest product boundaries. Do not fabricate customer counts, reviews, awards, certifications, regulatory approval, case-study results or performance statistics.

When an existing guide changes materially, update both canonical HTML and its Markdown mirror, update `dateModified`, run `npm run seo:prepare`, deploy, then run `npm run seo:postdeploy`. The sitemap builder uses explicit `article:modified_time` or JSON-LD `dateModified` metadata. It never invents a freshness signal from filesystem or build timestamps; if a page has no trustworthy explicit date, `lastmod` is omitted until the content owner updates its metadata.

## Multimedia

Use genuine product screenshots, demonstrations and explanatory media when they are available and current. Do not manufacture screenshots or videos solely for ranking. Optimize dimensions and file size, provide descriptive alternative text, and keep the media adjacent to text that explains what it demonstrates.

## Periodic review

At least monthly, review Search Console, Bing Webmaster Tools, AI citation reports, crawl errors, Core Web Vitals, broken links, stale claims and regional authority references. A technical score is only meaningful when production telemetry confirms that crawlers and users can actually reach the content.
