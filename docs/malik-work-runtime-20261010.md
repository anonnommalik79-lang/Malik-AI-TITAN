# Malik Work: verified repository-execution stage, 2026-10-10

## Scope and release status

Inspected base: `a1ada98317662b3d7de39ffb08d15ac6a05ed54c` (`origin/main`).
Feature branch: `codex/malik-work-runtime-20261010`.
This is a bounded first implementation stage, **not full Codex/Claude Code parity**.
Main is not merged or pushed. Render and production configuration/data are untouched.
Commits and PR title use `[skip render]`; deployment is manual and belongs to the owner.

The overriding UI freeze was respected: no TSX/JSX, CSS, navigation, composer,
icon, layout, public asset or other-section UI changes. Existing Work components
render actual backend events. No second dashboard, agent framework or dependencies
were introduced. The existing OS executor, model router and owner-scoped store are reused.

## Root cause

The shared scheduler classifier searched the entire prompt for scheduling words.
Engineering briefs containing checklist instructions such as “подготовь”, “следи”
or examples of recurring tasks could therefore become a scheduled task.
Work now recognises only a direct top-level scheduling request. Nested examples,
quoted material and technical missions do not schedule themselves. Ordinary Chat
still calls the original classifier; genuine Work reminders remain supported.

## Implemented

- Explicit Work repository tasks select the existing flow executor. Ordinary
  questions, guests, incidental GitHub mentions and ambiguous multi-repo goals
  do not silently begin repository execution.
- Work GitHub briefs retain newlines and their tail up to 120,000 characters;
  ordinary Chat flow limits and whitespace normalisation remain unchanged.
- GitHub inspection resolves a real branch/default branch to a commit SHA,
  then reads the tree and files at that SHA. Public reads are explicitly enabled
  only by this Work runtime; private access still uses the owner's Pipes credential.
  The legacy GitHub API does not silently opt into unauthenticated fallback.
- A strict, bounded model decision loop selects relevant files, proposes complete
  replacements/new files and can repair invalid syntax. No static site template
  replaces the model's code. Maximum 8 decisions per attempt, 3 parallel reads,
  12 files, 40,000 characters per read, 100,000 source/patch characters.
- Existing files must be read before modification. Truncated trees cannot justify
  creating potentially existing unread files. Symlinks, traversal, binaries,
  credential folders/files and recognised private-key/token content are denied.
  Repository text is treated as untrusted data, not operational instructions.
- Real JS/TS/JSX and JSON syntax checks run without evaluating the proposed code.
  Unsupported formats and build/unit-test/command execution are explicitly NOT RUN.
  TypeScript declarations are handled without attempting declaration emission.
- Actual operation start/completion/failure events enter the existing journal/SSE.
  They describe reading GitHub, model decisions and parsing, never fabricated
  terminal execution or hidden model reasoning.
- Original SHA is checkpointed before the first model/file call. Retry resumes
  that snapshot. Corrupt or unsafe checkpoints fail closed.
- Reports and proposed code files become real private artifacts, downloadable
  through the existing ZIP/PDF/DOCX export routes. Summary does not claim commit,
  build or unit-test success that did not occur.
- Existing cancellation, idempotency, history, account isolation, limits and
  artifact validation remain in use. GitHub writes still require the existing
  preview, HMAC confirmation, durable receipt and expected-SHA checks; no new
  agent path auto-writes to GitHub.

## Evidence and verification boundaries

Local QA used Node 22.23.3, Next 16.2.7, TypeScript 5.7.3, React 19.2.6 and
ESLint 10.4.1, with cached dependencies in an isolated source copy, no production ENV.
Browser fixtures used the installed headless Chromium. No paid model calls occurred.

| Scenario | Result | Evidence / boundary |
|---|---|---|
| Long engineering brief, direct reminder separation | PASS | `verify-work-runtime.mjs`; real intent/router/API |
| GitHub repository really read | PASS | Real read-only GitHub driver: `octocat/Hello-World`, commit `7fd1a60b01f91b314f59955a4e4d4e80d8edf11d`, README 13 bytes |
| Bug diagnosis, patch, verification | PASS for fixture patch and syntax | Real executor/parsers/exports; model and GitHub IO fixtures. Agent sandbox build/unit tests NOT RUN |
| Work journal follows actual execution events | PASS | React live hook → HTTP API/SSE → real executor/store; 3 desktop/mobile browser scenarios, mocked auth/model/GitHub |
| Browser only when needed | PASS routing regression | Existing `browser-and-photos` tests; new general click/type browser agent NOT IMPLEMENTED |
| Actual PDF/DOCX/ZIP files | PASS | Existing export suite 15/15; runtime export and browser ZIP/DOCX downloads |
| Cancellation and resume | PASS | Actual AbortSignal, original-SHA retry and corrupt-checkpoint rejection |
| Tool error is not shown as success | PASS | Invalid decisions/failed read tests; provider-failure browser scenario without artifacts |
| Owner isolation | PASS | Actual store/routes reject another account/guest, authenticated boundary mocked |
| Mobile/desktop component behaviour | PASS | 320/390/430/768/1440 widths and reduced-motion fixtures; no overflow/console errors |
| Source-level UI freeze | PASS | `verify-work-ui-freeze.mjs` against the pinned base |
| Typecheck | PASS | `tsc --noEmit` and production build TypeScript phase |
| Production compilation | PASS | Isolated `next build --webpack`, 84 static pages, no production secrets |
| Changed-file lint | PASS | Backend/test TS/MJS diff: 0 errors, 0 warnings; baseline had 2 errors in touched validator |
| Global lint | FAIL / pre-existing debt | Initial full scan: 77 errors, 258 warnings. Unrelated files remain out of scope; two touched validator errors removed |
| New runtime and GitHub driver regression suites | PASS | 15/15 runtime + 5/5 snapshot checks |
| Existing Work/API/OS regressions | PASS | Router 114/114; journal 6/6; skills 5/5; GitHub approval/driver 11/11; OS 21/21 + 12/12 + 12/12 |
| Chat transport regression | PASS | 12/12 network fixtures; test loader corrected for Windows paths/server-only boundary, no transport behaviour edit |
| Full existing release-core regression suite | PASS | All chained groups completed with exit 0 in an isolated copy preserving repository hierarchy; CRLF-only video assertion repaired |

Browser screenshots are local evidence under
`C:/Users/HUAWEI/Documents/Codex/QA/work-runtime-20261010-evidence/`.
They show real components/fixture scenarios, **not full authenticated production
dashboard QA or a physical iPhone/Android test**. Full live model/OAuth/private
GitHub execution and production screenshot comparison were NOT RUN.

Reproducible new commands from `app/templates/sovereign-hub-ui`:

```sh
npm run test:work-runtime
npm run test:work-github-snapshot
npm run test:work-ui-freeze
npm run test:work-repository-ui # requires configured Playwright/browser paths
```

The snapshot suite defaults to HTTP fixtures. Only an explicit
`MALIK_WORK_PUBLIC_GITHUB_LIVE=1` enables its public read-only GitHub test.
CI adds the first two suites, not live production smoke or deployment.

## Changed files

Under `app/templates/sovereign-hub-ui/`:

- `app/api/os/flows/route.ts`, `app/api/stream/route-impl.ts`
- `lib/work/intent.ts`, `lib/work/orchestrator.ts`, `lib/work/github.ts`
- `lib/work/repository-plan.ts`, `lib/work/repository-checks.ts`, `lib/work/skills/registry.ts`
- `lib/os/executor.ts`, `lib/os/runtime.ts`, `lib/os/types.ts`, `lib/os/validate.ts`
- `lib/os/tools/contract.ts`, `lib/os/tools/registry.ts`, `lib/os/tools/text-tools.ts`, `lib/os/tools/github-tool.ts`
- `scripts/verify-work-runtime.mjs`, `scripts/verify-work-github-snapshot.mjs`
- `scripts/verify-work-repository-browser.mjs`, `scripts/verify-work-ui-freeze.mjs`
- `scripts/verify-work-skills.mjs`, `scripts/verify-network-access.mjs`, `package.json`
- `scripts/verify-video-music-production.mjs` (CRLF-compatible test assertion only; no media product code edit)

At repository root: `.github/workflows/production-build-check.yml` and this report.

## Remaining stages and limitations

No terminal/sandbox execution, dependency installation, full build/test runner,
general autonomous click/type/download browser worker or new durable distributed
queue was implemented in this stage. A configured isolated execution provider is
needed before generated code may safely run; never execute it on the production host.

No claim is made that the task continues after process restart/tab close without
an actually configured durable backend/worker. Existing private S3/R2 storage is
reused when configured; the memory fallback cannot establish durability.

History reopening still uses the existing frontend reference model; a not-yet-started
large task can inherit its legacy client restoration limits. Started tasks recover
the stored flow by ID; changing those frontend limits is deferred under this UI freeze.

The bound of 12 files is not full-repository refactoring coverage. Secret filters
cover recognised files/patterns, not a guarantee of detecting every embedded secret.
Live OAuth/provider/device tests and global lint debt remain explicit release gates.

## Manual release procedure (owner only)

1. Review the feature PR and the verification boundaries above. Do not treat it
   as a claim of complete agent parity or all-green global lint.
2. Keep the PR unmerged until the remaining release gates you require are checked.
3. If accepted, merge the reviewed branch yourself. `[skip render]` is intentional;
   no automatic Render deployment is requested by this work.
4. In Render, manually deploy the reviewed commit. No new keys or production
   configuration were created here. Existing model configuration is required;
   private GitHub work requires the user's existing Pipes connection.
5. In Work, use a small authorised test repository. Inspect the fixed SHA, real
   file receipts, report and downloaded patch. Confirm build/unit tests say NOT RUN.
6. Check ordinary Chat, genuine reminders, history and account isolation before
   allowing any separately confirmed external GitHub write.
