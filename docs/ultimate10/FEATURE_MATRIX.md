# ULTIMATE 10 — evidence matrix

Checkpoint: 2026-10-24. **ULTIMATE 10 INCOMPLETE**. A module's existence is not an end-to-end PASS.

| System | Actual capability | Remaining limitation | Executed evidence this session | Readiness |
|---|---|---|---|---|
| Proof Passport | Game passport reused; Forge HTML/chat/publication and project ZIP have server-derived checks; missing review is not PASS; stale CLI receipts are discarded after source edits | Browser/media/build/unit checks remain not_run without receipts; not a cryptographic attestation; unrelated legacy export paths are not all covered | `test:project-passports` 5/5; full release-core passed before last ledger integration | Core implemented, wider export coverage incomplete |
| Self-Build | Main chat automatically selects Node CLI authoring; requirements/plan/files; real static diagnostics; at most 2 repair rounds, stops without improvement; code-bound external test protocol; ZIP/passport | No production isolated worker configured or proved. No local arbitrary-code execution. No Next install/build or static-web Self-Build acceptance | `test:selfbuild` 7/7 including actual Node test fail/repair/pass on reviewed fixtures; main HTTP/source/download test PASS | Source delivery implemented; production runtime NOT_TESTED |
| Truth Engine | Unified VERIFIED/SUPPORTED/UNCERTAIN/UNVERIFIED ledger, final SSE payload + restored message + existing disclosure; MAX metric-disagreement count; on-demand verify shares it | Bounded explicit claims and lexical matching, not universal semantic verification; live model acceptance NOT_TESTED | `test:claim-ledger` 12/12; main HTTP/SSE/restore and verify route 2/2 PASS | Implemented core, bounded scope |
| Reference sites | Existing distinctive website model path + Forge | WIP composition branch is NOT imported; 3 reference compositions not verified | Existing Forge 16/16 regression scenarios, not visual-reference acceptance | Partial |
| Mission Control | Existing OS graph/executor/confirmations | Roles and critic/integrator acceptance pending | NOT_TESTED | Partial |
| Live Studio | Existing file diagnostics/preview/history | Chat-edit-to-preview acceptance pending | Existing Work suite exercised, not new acceptance | Partial |
| Deep Research | Existing bounded search/read and source receipts | Dated claim-provenance export/continue acceptance pending | NOT_TESTED | Partial |
| Omni Live | Existing voice paths | Unified multimodal history acceptance pending | NOT_TESTED | Partial |
| Second Brain | Browser memory, OS library and account stores exist | Server memory integration/export/delete isolation acceptance pending | NOT_TESTED | Partial |
| World Engine | Existing 2D Game Studio | Three.js scene-spec engine not implemented | NOT_TESTED | Incomplete |
| Oil Digital Twin | Existing deterministic petroleum formulas/reports | Asset/scenario versioned twin acceptance pending | NOT_TESTED | Partial |
| Shared integration | Existing main SSE route/model router/activity reused | Cross-module runtime acceptance pending | NOT_TESTED | Partial |

No production deployment or live-model certification is implied by fixture tests.
