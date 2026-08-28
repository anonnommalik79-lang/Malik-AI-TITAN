# Voice audio: configuration and verification

The rest of the UI/auth is unchanged. Speech playback now uses the output
AudioContext unlocked by the Voice opening gesture, without patching all media
elements. Stop/close cancels pending replies and active audio. Failed playback
keeps the neural audio for the **Озвучить ответ** retry; it does not show a
successful speaking state just because text arrived.

## Server environment (Render, never commit actual secrets)

- Russian **and Kazakh** neural speech: existing `ELEVENLABS_API_KEY` (or
  `ELEVENLABS_VOICE_API_KEY`). The key needs text-to-speech permission and available
  quota. The server calls `eleven_v3` explicitly: v2/Flash do not support Kazakh.
  No separate Python/Kokoro server is needed when ElevenLabs returns audio.
  Default ElevenLabs voice: George (`JBFqnCBsd6RMkjVDRZzb`). Optional
  `ELEVENLABS_VOICE_ID` selects another voice available to your account;
  `ELEVENLABS_VOICE_ID_RU` / `ELEVENLABS_VOICE_ID_KK` override it by language.
  Existing UI presets remain compatible: a preset-specific variable such as
  `ELEVENLABS_VOICE_ID_PUCK` takes precedence. Without overrides they use George,
  not an imitation of Gemini/Kokoro voices. Calm/Strong retain delivery settings.
- Russian fallbacks: existing Gemini, then xAI credentials. Nothing needs to be
  added for these if ElevenLabs works. `GEMINI_TTS_MODEL` keeps its existing default.
- English: `DEEPGRAM_VOICE_API_KEY` **or** `DEEPGRAM_API_KEY` (Flux), with Gemini
  and then existing `XAI_VOICE_API_KEY` / `XAI_API_KEY` as REST fallbacks.
- Voice answer / transcription: existing `GROQ_VOICE_API_KEY` / `GROQ_API_KEY`,
  or the existing Cloudflare credentials. These alone do **not** enable RU/KK TTS.
- Google search on an explicit spoken request: `SERPER_API_KEY`. Existing
  `TAVILY_API_KEY` / `BRAVE_SEARCH_API_KEY` are fallbacks, not additional parallel
  searches. Ordinary voice conversation does not query these services.
- Optional Kazakh fallback on the Python deployment: existing Kokoro runtime/dependencies and model.
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

Store keys only in Render Environment, never in client-side `NEXT_PUBLIC_*`
variables. Save and redeploy. A configured key is not proof of functioning audio:
run the live test for both `ru` and `kk`, then listen on the target phone.

Provider contracts: [ElevenLabs TTS](https://elevenlabs.io/docs/api-reference/text-to-speech/convert),
[Eleven v3 languages](https://elevenlabs.io/docs/overview/models#eleven-v3),
[Deepgram Flux REST](https://developers.deepgram.com/docs/flux-tts/batch),
[Gemini speech generation](https://ai.google.dev/gemini-api/docs/speech-generation).
