# Voice audio: configuration and verification

The rest of the UI/auth is unchanged. Speech playback now uses the output
AudioContext unlocked by the Voice opening gesture, without patching all media
elements. Stop/close cancels pending replies and active audio. Failed playback
keeps the neural audio for the **Озвучить ответ** retry; it does not show a
successful speaking state just because text arrived.

## Server environment (Render, never commit actual secrets)

- Russian neural speech: `GEMINI_VOICE_API_KEY` **or** existing `GEMINI_API_KEY`.
  `GEMINI_TTS_MODEL` defaults to `gemini-3.1-flash-tts-preview`.
- English: `DEEPGRAM_VOICE_API_KEY` **or** `DEEPGRAM_API_KEY` (Flux), with Gemini
  and then existing `XAI_VOICE_API_KEY` / `XAI_API_KEY` as REST fallbacks.
- Voice answer / transcription: existing `GROQ_VOICE_API_KEY` / `GROQ_API_KEY`,
  or the existing Cloudflare credentials. These alone do **not** enable Russian TTS.
- Google search on an explicit spoken request: `SERPER_API_KEY`. Existing
  `TAVILY_API_KEY` / `BRAVE_SEARCH_API_KEY` are fallbacks, not additional parallel
  searches. Ordinary voice conversation does not query these services.
- Kazakh on the Python deployment: existing Kokoro runtime/dependencies and model.
  On a **Node-only** deployment, set `KOKORO_TTS_URL` to the origin of your
  separately running Python voice service (serving `/api/voice/tts`). Existing
  `MALIK_BACKEND_URL` is also recognized. This variable does not provision a server.

## Checks

`npm run test:voice` checks wiring and playback/search behavior using test doubles.
It does not prove that a real device produces sound or that provider credentials work.

`npm run test:voice:live -- https://YOUR-REAL-APP` calls the real speech endpoint,
checks the returned audio and saves it in ignored `.voice-check/` for listening.
Set `VOICE_TEST_TRANSCRIBE=1` for a real TTS → STT round trip (uses provider quota).
Set `VOICE_TEST_LANGUAGE=ru|en|kk` to select the language. A signed-in test session
can be supplied through `VOICE_TEST_COOKIE`; otherwise the existing guest flow is used.

Final device check: open Voice → allow mic → speak → hear reply → interrupt it →
hear the next reply. Ask to search and check the answer; then have an ordinary
conversation without search requests. Check on the target phone as well as desktop.
If autoplay is blocked, the UI explicitly offers a tap to play the saved audio.

Provider contracts: [Deepgram Flux REST](https://developers.deepgram.com/docs/flux-tts/batch),
[Gemini speech generation](https://ai.google.dev/gemini-api/docs/speech-generation).
