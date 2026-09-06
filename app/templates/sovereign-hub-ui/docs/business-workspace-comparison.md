# Business workspace — scope and comparison

## Implemented

- Direct workspace entry, no marketing landing screen.
- Existing eight-role model pipeline and industry templates retained.
- Editable company context; TXT/MD/CSV ingestion with size and character limits.
- Russian, Kazakh and English output selection.
- Browser-local account-scoped draft, checkpoint and reusable scenario storage.
- Retry from the first unfinished stage without repeating completed stages.
- Cancellation and protection against late responses overwriting a newer run.
- Download completed documents as Markdown; JSON execution log and per-stage copy/export.
- Deterministic unit-economics calculator; scenario inputs can be sent to agents.
- All preceding role summaries supplied to subsequent roles; truncation marked.
- Instructions distinguish facts, hypotheses, sources, arithmetic and unexecuted external actions.

## Comparison with public Claude capabilities

Sources checked: [Cowork](https://claude.com/product/cowork),
[Projects](https://support.claude.com/en/articles/9517075-what-are-projects).

| Capability | Malik workspace status |
| --- | --- |
| Project knowledge and instructions | Bounded text context and editable instructions; no semantic document retrieval |
| Reusable workflows | Industry templates and browser-local saved scenarios |
| Step visibility and deliverables | Role states, errors, model metadata, Markdown and JSON downloads |
| Background / scheduled execution | Not implemented here; closing the tab stops execution, checkpoints support manual continuation |
| Connected business tools | Not added here; no claim of live CRM, email, payment or publishing actions |
| Cross-device shared projects | Not implemented here; storage is browser-local |
| Output quality superiority | Not established; requires matched tasks, blind scoring and live provider evaluation |

## Verification

- TypeScript compilation.
- Static section checks (83 assertions).
- Deterministic economics assertions.
- Browser contract test uses explicitly mocked API responses to exercise failure and resume. It is not evidence of live model quality.

## Next meaningful work

Server-side durable jobs with authenticated ownership and explicit action approvals;
real connectors with scoped credentials; document retrieval and provenance; matched-task
quality/cost/latency evaluations. These are separate engineering milestones, not UI toggles.
