# Main chat continuity — 2026-11-01

## Reproduced causes

Baseline: `2078e5f1` (main when this branch was created).

1. `resolveConversationIntent` treated “Why?”, “Продолжай”, “А теперь лучше”
   and several Kazakh follow-ups as unrelated requests. Preferences were
   accumulated only on some transformations, so language/format disappeared.
2. Language names mentioned as a subject could silently become an output
   language instruction. Conversely, conversation-wide preferences were lost
   on a new subject; turn-local and conversation-wide requirements were mixed.
3. Conversation focus searched only four earlier user messages. A style-only
   turn could become the subject instead of the task it modified.
4. The provider serializer discarded any trailing user message, including a
   distinct earlier instruction. An oversized assistant turn could consume the
   whole history budget and hide the user's preceding data.
5. The coding path accepted only `messages` and kept ten turns. The verified
   owner context independently kept ten, so improving the ordinary path alone
   would not fix the owner's chat. Empty `history` could mask valid `messages`.
6. Contextual greetings could bypass the model and the active language contract.
   A simple brief follow-up could receive an 8,000-token output allowance.
7. A syntactically valid JSON correction bypassed unchanged-answer validation.
   There was no buffered check for unsupported first-person execution claims.

## Changes in the existing pipeline

- Added a bounded history utility shared by existing consumers: role filtering,
  canonical history selection, exact current-turn deduplication, and clipping
  that reserves room for the user's earlier question. It does not store memory,
  introduce an agent or choose models.
- Expanded existing follow-up/focus/continuation recognition for RU/KK/EN;
  changed the existing focus/domain window to the same bounded 64-message
  scope. Style-only changes no longer replace the conversation's subject.
- The existing intent ledger derives preferences from user instructions, not
  assistant statements, code blocks or quotations. Explicit overrides,
  conversation-wide settings, one-answer overrides, reset and format
  cancellation are distinguished. File output does not turn an ordinary “why”
  into another export.
- The owner wrapper retains the bounded dialogue and avoids duplicating its
  server-generated context. Language selection for identity replies now honors
  the active conversation preference; account verification is unchanged.
- Contextual greetings reach the existing model path. Fresh-chat instant
  behavior remains. Brief plain follow-ups receive a smaller output allowance;
  explicit long/structured deliverables retain their completion budget.
- Existing continuation overlap handling is retained and tested with streamed
  character chunks. Manual resume recognizes more natural RU/KK/EN requests.
  No blanket paragraph deletion or sentence-cutting rule was introduced.
- Existing validation now checks unchanged JSON repairs too. Specific
  execution/status requests can withhold a draft that claims commands or
  external writes without a receipt. The existing single repair shares the
  output allowance; tools are not replayed. Repeated failure is reported as
  unconfirmed work, including in Kazakh. Ordinary chat retains streaming.
- Freshness/evidence/accuracy gates are retained. An explicit new search wins
  over an earlier no-web preference; a follow-up is not automatically a rewrite.

## Before/after methodology

`conversation-continuity-dialogues.mjs` is the same input/assertion suite for
both runs. The runner loads actual production TypeScript from `git show` for
the baseline, and from the working tree for the changed version. History
fixtures represent previous dialogue; they are not generated answers supplied
to the runtime to manufacture a successful score.

The integration probes stop at the selected model boundary with a sentinel
exception and inspect the actual outgoing context, language contract and call
count. They return no model answer. Separate deliberately invalid drafts test
the HTTP/SSE rejection path and the one-repair limit; they are not used as
evidence of model answer quality.

```sh
node scripts/verify-conversation-continuity.mjs --ref=2078e5f1 --record-baseline --output=before.json
node scripts/verify-conversation-continuity.mjs --output=after.json
npm run test:domain-intelligence
npm run test:ultimate-core
npm run test:chat-stream-integrity
npm run test:brain
npm run test:code-completion
npm run test:chat-liveness
npm run build -- --webpack
```

The baseline-recording option records FAIL cases without failing the shell;
it never relabels them PASS. Normal execution fails if any assertion fails.
Per-case before/after results are in the accompanying JSON audit artifact.

### Confirmed results

- Identical dialogue/packet suite: **19/66 baseline → 66/66 changed**.
  These counts are assertions about deterministic pipeline behavior, not
  live-model answer accuracy. The JSON includes the exact fixture-file hash.
- Domain intelligence/execution: **103/103 PASS**; stream evidence lanes:
  **7/7 PASS**.
- Ultimate core HTTP/SSE, files and claim-ledger regressions: **33/33 PASS**,
  including RU/KK/EN invalid execution drafts withheld from the user, one
  correction at most, and honest nonexecution accepted without correction.
- Response quality, code completion, chat liveness, Brain and stream-integrity
  suites: **PASS**. Stream integrity: **11/11 PASS**.
- Targeted lint: **0 errors, 1 existing warning** (`searchGroqBrowser` unused;
  unchanged from baseline). Standalone clean-copy TypeScript: **PASS**.
- Final production build (`npm run build -- --webpack`): **PASS**, exit 0,
  including compilation, TypeScript and static page generation.

### Changed areas

| Files | Purpose |
| --- | --- |
| `lib/ai/conversation-history.ts`, `lib/server/malik-model-router.ts` | Canonical, bounded provider history and exact deduplication |
| `lib/ai/conversation-intent.ts`, `conversation-focus.ts`, `domain-intelligence.ts` | Follow-ups, subject and preference ledger |
| `lib/ai/answer-budget.ts`, `response-depth.ts`, `answer-completion.ts` | Appropriate depth, complete bounded continuation |
| `lib/ai/conversation-validation.ts`, `app/api/stream/route-impl.ts` | Real validation and one-repair pipeline wiring |
| `lib/malik-god-router.ts`, `lib/server/malik-owner-context.ts` | Consistent contextual delivery and owner/identity history |
| `scripts/conversation-continuity-dialogues.mjs`, `verify-conversation-continuity.mjs`, `package.json` | Reproducible baseline/changed regression command |
| `scripts/verify-domain-execution.mjs`, `verify-live-intelligence-lanes.mjs`, `verify-ultimate-chat.mjs` | Keep existing harness dependencies current; HTTP/SSE failure tests |
| `audit/CONVERSATION_CONTINUITY_20261101.md`, `.json` | Findings, scope and per-case measurements |

## Scope and limits

- No TSX, CSS, sidebar, start-screen, layout or animation file changed relative
  to the baseline. This is source-diff evidence, not a browser screenshot test.
- No new model, router, vector database, persistent memory, provider account or
  deployment was introduced. Existing bounded context limits still apply;
  unavailable earlier messages are not reconstructed or invented.
- The measurements are context/routing/serialization/validation regressions,
  not a percentage of correct live-model answers or a GPT/Claude comparison.
  No configured local model credentials were available in this run; a live
  generative A/B evaluation remains unverified.
- Action-claim checking is intentionally conservative and scoped to explicit
  execution/status requests. It does not certify arbitrary facts or detect all
  possible dishonest phrasings. Tool receipts and existing evidence gates remain
  authoritative; assistant history alone is not proof of an external action.
- The old function-extraction harnesses were updated with the real dependencies
  they omitted. Existing assertions and external-operation prohibitions remain.
- Production deployment on Render is excluded. Auto-deploy was checked as off
  before preparing the user-authorized main publication.
