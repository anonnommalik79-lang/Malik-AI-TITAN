import assert from "node:assert/strict"
import fs from "node:fs"

const read = (file) => fs.readFileSync(file, "utf8")

const musicStatus = read("app/api/media/music/status/route.ts")
const musicFile = read("app/api/media/music/file/route.ts")
const musicDownload = read("app/api/media/music/download/route.ts")
const voiceRoute = read("app/api/voice/tts/route.ts")
const voiceClient = read("components/voice/VoiceMode.tsx")
const speechChunks = read("lib/voice/speech-chunks.ts")
const presentationRoute = read("app/api/presentations/export/route.ts")
const presentationClient = read("components/sovereign/presentations/PresentationStudio.tsx")
const presentationBrowser = read("lib/presentations/browser-export.ts")
const pptx = read("lib/presentations/pptx.ts")

assert.match(musicStatus, /provider-direct-browser/)
assert.match(musicStatus, /renderAudioBytes:\s*0/)
assert.match(musicFile, /x-malik-render-audio-bytes": "0"/)
assert.match(musicDownload, /x-malik-render-audio-bytes": "0"/)
assert.doesNotMatch(musicFile, /new Response\(upstream\.body/)
assert.doesNotMatch(musicDownload, /new Response\(upstream\.body/)

assert.match(voiceRoute, /VOICE_RENDER_MAX_AUDIO_BYTES \|\| 320_000/)
assert.match(voiceRoute, /x-malik-render-audio-bytes/)
assert.match(voiceClient, /VOICE_NEURAL_CHUNKS_PER_TURN = 2/)
assert.match(voiceClient, /speakBrowser\(tail, selectedVoice, selectedLanguage/)
assert.match(speechChunks, /FIRST_CHUNK = 110/)
assert.match(speechChunks, /LATER_CHUNK = 160/)

assert.match(presentationClient, /buildPresentationPptxInBrowser/)
assert.match(presentationBrowser, /browser-local-zero-render-binary/)
assert.match(pptx, /buildPptxBlob/)
assert.match(presentationRoute, /PRESENTATION_RENDER_FALLBACK_MAX_BYTES = Math\.min\(renderResponseBudgetBytes\(\), 600_000\)/)
assert.match(presentationRoute, /x-malik-render-binary-budget/)

console.log("✓ music: provider-direct audio, zero Render MP3 bytes")
console.log("✓ voice: max 2 neural chunks × 320 KB, then on-device speech")
console.log("✓ presentations: browser-local PPTX first, server fallback capped at 600 KB")
