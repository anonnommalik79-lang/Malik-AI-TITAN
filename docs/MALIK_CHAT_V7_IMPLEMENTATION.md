# Malik Chat V7: incremental release, 8 October 2026

This commit ships an actual small functional slice, **not** all proposed AI engines.

- Simplifies the first chat screen: monochrome layout, responsive quick prompts, no fabricated official logo.
- The depth selector controls the existing `responseDepth` passed to `onSendMessage`; saved using `saveResponseDepth`. MAX respects the current PRO entitlement and billing callback.
- Search switch controls existing `researchMode`; no fake search status or added API calls. Deep research remains available through the existing workspace.
- Preserves the existing voice, files, model selector, chat history, Work, media and authorization flows.
- Runs no new server jobs; CSS scopes to `#malik-root .malik-v7-*`.
- Add-on test: `npm run test:chat-experience` (static wiring, not a full build).

**Next independently gated phases**: reliable stream recovery and permanent user-scoped history; quality-aware MAX routing; evidence/citations with freshness; opt-in scoped Memory 2.0; tool actions with confirmation and audit; verified Vision/Compute; validated interactive response blocks with text fallback; missions and integrations.

**Mandatory before production-ready claim**: fresh `npm ci`, `npm run typecheck`, chat/mobile/auth tests, `npm run build`, and device checks on iOS Safari + desktop. Not run by this commit.
