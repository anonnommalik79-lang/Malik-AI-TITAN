# Chat code completion and model-authored websites

## Scope

Branch: `codex/complete-code-20261020`, based on `dfdc37b1`.
No component, global style, navigation, Sites studio or Render configuration was changed.
No production deployment or push is part of this change.

## Reproduced causes

1. A short request such as `сгенерируй мне игру` did not count as coding. It
   could enter the 1,500-token fast-chat lane, despite producing a large file.
2. Every output used the same five-continuation ceiling. Smaller provider caps
   could exhaust it while useful output allowance remained.
3. Literal backticks, mismatched fence markers, a repeated opening fence and
   repeated code could confuse completion/merging. Display-only closing fences
   were left in the history sent for manual continuation.
4. Some ordinary website requests entered Site Forge: the model authored JSON
   content, but a fixed renderer determined the actual layout. Generic/3D sites
   could instead be forced into a project builder unnecessarily.

These are locally reproduced paths consistent with the screenshots, not a
claim that production request/provider logs were available.

## Changes

- Shared runnable-software intent recognition feeds request kind, brain task
  and conversation intent. Stories, game rules, board games, media and quoted
  examples are excluded from the new recognition rule.
- Actual generated code can promote an initially non-coding answer before
  continuation. Provider limits and observed length-stopped chunk sizes adjust
  continuation allowance, bounded at 24 rounds. Quota, finite wall time, explicit
  cancellation and no-progress guards remain. Coding receives a recovery reserve.
- Provider-reported generated output counts are used where available, including
  discarded repetitions; otherwise bounded character estimates are used.
- Matching Markdown fence parsing supports backtick/tilde lengths and the
  existing CR transport convention. A repeated opening wrapper is removed before
  overlap detection. Partial tokens and the real final closing marker survive.
- Manual continuation removes the artificial display fence from history and
  explicitly starts a new fenced continuation message. Incomplete HTML is not
  called finished merely because its Markdown fence was closed.
- New stack-less websites go to the selected model for actual HTML/CSS/JS, not
  the fixed Forge renderer. Existing Forge edits and compound site+document
  delivery retain their established paths. Explicit frameworks/backends/ZIPs
  retain the checked project builder and receive the same server-owned design
  context.
- Chat-only art direction distinguishes product/3D, fashion, property,
  hospitality, commerce and an open adaptive fallback. The model is not given
  rendered templates. Composition suggestions vary with the brief; explicit
  user style/reference and accessibility take precedence.
- Existing bounded Pexels/NASA/Unsplash/Commons discovery supplies verified CDN
  URLs and credits. No media binary GET, storage or transcoding is added. Generic
  unclassified subjects are not assigned arbitrary stock imagery. Space/concept
  settings preserve image provenance rather than using ordinary hotel photos.
- A server-only Symbol carries the design/media context. JSON clients cannot
  fabricate a verified-media receipt. Missing media remains explicit; offline,
  no-photo and no-motion requests have dedicated guards. No extra design-planning
  model call is added.

## Verification

Run from `app/templates/sovereign-hub-ui` with the installed Node 20–22 runtime:

```text
npm run test:code-completion
npm run test:chat-website-design
npm run test:max
npm run test:titan-stage-a
npm run test:chat-stream-integrity
npm run test:brain
node --test scripts/verify-domain-intelligence.mjs scripts/verify-domain-execution.mjs scripts/verify-universal-delivery.mjs scripts/verify-chat-website-design.mjs scripts/verify-website-engine.mjs scripts/verify-website-experience.mjs
node scripts/verify-long-code-runtime.mjs
node scripts/verify-site-forge.mjs
```

The code-completion suite exercises real intent/brain logic, MAX lane requests,
provider SSE parsing, automatic merging and the real chat POST/client stream
contract. The 450-line output crosses 12 chunks; an unadvertised-cap fixture
also exceeds eight continuations. Tests cover token limits, repetition,
provider failure, cancellation, manual resume and final-content delivery.

External models, account identity and media services in these integration tests
are explicit fixtures. The controlled JavaScript file is parsed, not executed.
These tests do not prove the quality or functionality of an arbitrary live-model
website, and do not certify production credentials, browser rendering or deploy.

Confirmed local results:

- Code-completion + actual HTTP/SSE contract: 29/29 PASS.
- Combined domain, document delivery, website engine/experience and chat design:
  263/263 PASS (includes 22 chat-design checks).
- Existing MAX recovery: 37/37 PASS; Stage A: 27/27 PASS.
- Client stream integrity: 11/11 PASS; native execution: 25/25 PASS.
- Existing Forge/studio/edit compatibility: 16/16 PASS.
- Brain and long-code runtime invariants: PASS.
- Lint on changed production TypeScript: 0 errors, 4 existing warnings.
- QA/repository production-source hashes: match, 13/13.
- Production webpack build including TypeScript and 85 static pages: PASS.

The initial restricted-shell build hit Windows EPERM creating a `.next` path;
rerunning the local build with filesystem approval resolved that environment error.

## Remaining limits

- No promise of 100% completion or screenshot-level aesthetics for every request:
  upstream availability, account allowance, bounded recovery and model quality
  still matter. Real failures retain the incomplete status and manual resume.
- Markdown/HTML structural checks are not proof of working game logic, correct
  business requirements, pixel quality, responsive overflow or successful builds.
- Media metadata has bounded memory/latency, not zero memory use. CDN media is
  loaded by the visitor; existing provider rate limits/licensing remain.
- Per-turn winning-lane usage estimates are not a complete billing audit of
  existing hedged provider calls, hidden reasoning or all third-party costs.
- A signed-in staging chat with configured model keys is still required for a
  live model + desktop/mobile visual acceptance pass using the supplied references.

Suggested acceptance prompts: a 3D product platform with drag controls; a fashion
store with category/size/cart controls; a villa catalogue with filters; a large
playable browser game. Verify complete code, download/preview, real interactions,
mobile layout and honest image credits. Check that different subjects do not
share a fixed section skeleton and that Stop cancels rather than starting work again.
