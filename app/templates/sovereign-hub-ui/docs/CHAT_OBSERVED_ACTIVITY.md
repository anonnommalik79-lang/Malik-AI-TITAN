# Observed chat activity

Branch: `codex/chat-observed-progress-20261024`, based on `5e59aac3`.
The user requested keeping this work in a separate branch. No push to main,
Render deployment, infrastructure or credential change is authorized here.

## What changes

- A three-operation live journal appears inside the existing answer column.
  It uses actual tool events, bounded source excerpts and app-written descriptions,
  not hidden reasoning, invented model thoughts or timed fake progress.
- Search receipts start before I/O; successful indexed evidence is not labelled a
  failure. A missing optional index does not discard a successful live search.
- Found links, distinct sites, successfully read pages and unavailable pages are
  separate counters. Search snippets are not announced as read pages.
- Receipts include source links, readable titles and a confirmed-read label.
  Large source lists remain valid, bounded JSON with explicit detail limits;
  combined incomplete lists use conservative lower-bound counters.
- Real MAX review, synthesis and continuation operations publish public lifecycle
  events. Internal assessments, generated code and private prompts are not copied
  into these events. Model agreement is explicitly not external fact verification.
- Fixed the early `budget - 256` continuation cutoff introduced in the upstream
  elite-first change; caller quota, cancellation and all finite recovery caps remain.
- Users can hide/show the live journal, filter actions by type/problems, search
  receipt text, copy the report and use existing Markdown/JSON downloads.
  Raw payloads mount only when expanded. Answer text appears immediately without
  waiting for a panel, and the compact journal folds away when writing starts.
- History keeps its own receipts and does not replay live animations. Terminal
  failures/cancellations stay visible as limitations, not successful operations.
- Only the chat execution component and its scoped CSS change visually; sidebar,
  composer, navigation, global theme, model selector and other sections are intact.
  No additional model calls, external favicon requests or storage dependencies.

There is deliberately no fake “Skip” button: hiding activity does not cancel or
bypass necessary research. The existing Stop remains the actual cancellation path.

## Verification

Run in `app/templates/sovereign-hub-ui`, Node 20–22:

```text
npm run test:chat-activity
npm run test:max
npm run test:code-completion
npm run test:web-recovery
npm run test:chat-execution
npm run test:chat-execution-ui
node scripts/verify-response-stages-browser.mjs
npm run typecheck
npm run build
```

Browser tests use the real React component, actual CSS and controlled server
receipts at 320, 390, 430, 768 and 1440 px plus reduced motion. They cover the
journal, filtering, copy/download, history, isolation, escaped source text, and
no horizontal overflow. Their screenshots are explicitly QA fixture views.

Research tests execute the real `gatherSources` orchestration with injected
search/page boundaries, including errors, index-only results and Stop. MAX tests
execute the actual engine with fixture provider responses, including public
review/cancellation events. They do not certify live account credentials, paid
models, current web facts or a production deployment. Safari hardware and a
signed-in live-model acceptance pass remain separate checks.

Suggested checks in a configured local/staging chat:

1. Ask for current conference requirements: search starts before results appear;
   found links and read pages differ; unavailable pages remain explicit.
2. Ask an ordinary greeting/calculation: no fabricated web work or sources.
3. Ask for a long implementation: real continuation events, one final answer.
4. Stop during search/review: no replay, no fake completed operation.
5. Reload history: its own receipts return without a running activity animation.

To publish later, obtain explicit approval first; main and Render are unchanged.

## Confirmed local results

- New activity/orchestration regressions: 34/34 PASS; coordinator compatibility:
  6/6 PASS (40/40 in the combined run).
- MAX: 44/44 PASS, including review receipts, cancellation and fallback privacy.
- Code completion: 29/29 PASS, including real continuation receipt counts.
- Web recovery: 21/21 PASS; stream contract: 11/11 PASS; liveness: 9/9 PASS.
- Execution lifecycle/privacy/export/bounds and response-stage wiring: PASS.
- Chromium component scenarios: 6/6 PASS; full-CSS response stages: 5/5 PASS.
- TypeScript and production webpack compilation: PASS, 85 static pages generated.
- Changed production TypeScript lint: 0 errors, 1 pre-existing unused-function warning.

QA screenshots: `C:/Users/HUAWEI/Documents/Codex/QA/chat-activity-20261024/evidence/`.
These are actual component renders with labelled fixtures, not production screenshots.
