# Current answers and dated news — 2026-11-01

Final comparison base: `3328f73b` (includes Claude's already published chat UI
work). The implementation changes research data handling, not those UI files.

## Reproduced causes

1. An unchecked Web control set `research: false`, which suppressed mandatory
   current-fact searches as well as optional research.
2. Unqualified "latest news" had no evidence window. An undated snippet or an
   article up to 30 days old could stop provider fallback as current evidence.
3. Provider requests did not consistently carry the user's requested time range.
   Brave web page age could be mistaken for article publication time.
4. Source authority could outrank publication/event date in a news digest.
   A fresh source anywhere in the set could validate a citation to a stale item.
5. The free RSS fallback was separate from the shared research/voice search.
   Its feed order was truncated before chronological selection.

## Changes

- Current questions search automatically with the optional Web control off.
  Explicit no-web text, server disable and private/context restrictions remain.
  Stable arithmetic, creative writing, translation and basic science retain
  their existing paths without a forced network call.
- General news/discovery questions in RU/KK/EN use a rolling seven-day window
  when none is specified and a cache TTL of at most 60 seconds. Explicit today,
  yesterday/week/month/year periods are retained. Current stable versions are
  treated as current state, not necessarily releases announced today.
- Shared Serper, Brave and Tavily adapters receive bounded time filters from
  the original intent. Provider priority is Serper → Brave → Tavily, followed
  by configured/free fallbacks. Healthy fast-mode primary results stop further
  calls; fallback calls are sequential and keep existing deadlines/circuits.
- Reuse one bounded Google News RSS implementation for both search entry
  points. Preserve complete article URLs, parse a bounded candidate pool, and
  assess/date-sort before applying the returned-result limit.
- Assess publication/event date separately from read/update/crawl time. Reading
  an old article now does not make its event new. Provider date filters alone
  are not evidence that an event occurred in the period.
- Current-news/time-window source selection excludes stale/undated proof before
  giving it to the model. Old news citations are rejected even when a separate
  fresh source exists. Connected-project citations keep their own provenance
  and original numbering; they are not misclassified as public news.
- Current questions bypass the old shared answer cache. If no eligible current
  evidence is available, the existing pipeline reports that limitation instead
  of presenting an unverified current answer. No new model or answer engine.

Provider documentation: [Brave freshness](https://api-dashboard.search.brave.com/api-reference/web/search/get),
[Tavily date filters](https://help.tavily.com/articles/3347142954-best-practices).

## Executed checks

- Same 46 deterministic assertions: **15/46 baseline → 46/46 changed**.
  They cover topics/languages, date windows, cache expiry, stale citations,
  fallback, current prices/API limits/roles/versions, opt-out, full URLs and
  actual adapter HTTP parameters with isolated HTTP fixtures.
- Existing live-intelligence suite: **234/234 PASS**; real orchestration with
  fixture transports: **15/15 PASS**; stream lanes: **7/7 PASS**.
- Combined final news/project-delivery/passport regressions: **89/89 PASS**.
- Targeted lint: 0 errors; two existing unused-function warnings.
- A real public HTTP search using the actual shared search code, without paid
  search keys or an LLM call, returned four dated sources including an item
  published on 2026-11-01. Evidence/timing are in the JSON audit artifact.
- Final integrated production build: **PASS**, exit 0, including compilation,
  TypeScript and page generation with one local Next worker.

```sh
node --test scripts/verify-news-freshness.mjs
npm run test:live-intelligence
npm run build -- --webpack
```

The local 8 GB PC exhausted native memory with 11 page-data workers after
compilation and TypeScript had passed. The final local build uses
`CIRCLE_NODE_TOTAL=2` (one Next worker); project/Render configuration and
Claude's processes are unchanged.

## Limits and preserved scope

- Regression counts measure routing/data/validation behavior, not live-model
  factual accuracy. A live model-answer A/B evaluation was not performed.
- Real public RSS retrieval was exercised. Paid-provider requests were checked
  with isolated HTTP fixtures; no real paid search or model keys were used.
- News coverage depends on available publishers and transport. A seven-day
  default is not a promise of exhaustive or instant worldwide coverage.
- Publication dates supplied by sources can be wrong. These checks do not
  certify the truth of every claim in a current article.
- No dashboard, Stop, Markdown renderer, CSS, animation, voice, model-selection
  or LLM-provider implementation changed. Claude's published changes were
  incorporated without modifying them.
- A separate CI workflow runs these regressions. Existing shared package/CI
  scripts are unchanged. No Render deployment is performed.
