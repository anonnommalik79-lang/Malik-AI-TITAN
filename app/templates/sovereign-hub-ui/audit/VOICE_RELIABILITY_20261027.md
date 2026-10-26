# Voice reliability checkpoint — 2026-10-27

This is a focused reliability release, not certification of ChatGPT-equivalent
speech quality or completion of every possible Voice feature.

## Root causes and changes

1. Live used a second, narrower web-intent regex. Current CEO/version/product
   questions could skip the transcript-triggered search fallback. Extracted
   the existing server policy into browser-safe `lib/voice/search-intent.ts`;
   both Live and the server now use it. Provider modules stay server-side.
2. A search belonging to an interrupted or completed previous question could
   return on the same WebSocket and inject an obsolete answer. Cancel both
   queued and in-flight proactive searches on interruption/new user turns.
3. PCM waiting for mobile AudioContext.resume() survived stopOutput/close.
   Playback epochs invalidate that audio before it is scheduled. Malformed
   provider audio is caught instead of producing an unhandled rejection.
4. Unsupported microphone options caused capture to fail without a fallback.
   Retry once with basic capture only for unsupported-option errors. Never
   repeat permission, security, missing-device or device-busy errors. A closed
   session cannot start a stale fallback permission request.
5. Web Audio setup failures could retain an acquired microphone stream.
   Register stream/context ownership before setup, release them on failure,
   ignore obsolete failures, and distinguish access denial from device errors.

No menu, layout, CSS, voice selection, provider keys, pricing, billing or
production environment configuration changed. Existing AGC/near-field gate
settings were preserved; this patch does not identify a person's voice.

## Verification

- `npm run test:voice`: PASS, including real-session harness regressions.
- `node scripts/verify-voice-understanding.mjs`: PASS (74 checks).
- `npm run test:voice-reliability`: PASS (42 checks).
- Three new Live harness scenarios cover current CEO search, cancellation of
  an old search timer, and a late search response after interruption.
- Tests use the actual TypeScript helpers/session with controlled browser,
  transport and audio fixtures; they do not call a paid model or search API.
- Understanding tests now load the shared intent module through the existing
  recursive loader instead of unresolved relative imports from a data URL.
- Changed-file lint: 0 errors, 3 pre-existing warnings in VoiceMode/Live client.
- Production webpack build, TypeScript and static page generation: PASS.
  Initial local build hit Windows EPERM in .next; retry with QA-directory
  access passed without changing production configuration.
- Real Chrome Voice UI at 375 and 1440 px: PASS. Guest entry uses the real
  endpoint cookie while retaining the local QA host; automatic microphone
  startup is included in the permission-denial count.

`scripts/verify-voice-ui.mjs` checks the real rendered dialog at 375/1440 px,
permission denial, device failure, close, viewport bounds and page errors.
It blocks Voice API traffic and replaces microphone capture with controlled
errors; it is not a hardware speech test.

## Remaining verification

Real iPhone/Android/laptop speech, quiet/distant speakers, music/TV, echo,
real provider STT/TTS quality, mixed-language pronunciation and network
handover must still be exercised with hardware and configured providers.
No production spoken turn was submitted by these automated tests.
