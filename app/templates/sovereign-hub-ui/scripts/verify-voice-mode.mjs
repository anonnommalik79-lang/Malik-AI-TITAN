import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import path from "node:path"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const read = (file) => readFile(path.join(root, file), "utf8")

const [home, chat, dashboard, sidebar, mode, dock, orb, settings, sound, tts, turn, flux, token, transcribe, css, homeCss, chatCss] = await Promise.all([
  read("components/sovereign/hybrid/MalikHybridHome.tsx"),
  read("components/sovereign/chat-view.tsx"),
  read("components/sovereign/dashboard.tsx"),
  read("components/sovereign/sidebar.tsx"),
  read("components/voice/VoiceMode.tsx"),
  read("components/voice/VoiceDock.tsx"),
  read("components/voice/VoiceOrb.tsx"),
  read("components/voice/VoiceSettings.tsx"),
  read("lib/voice-transition-sound.ts"),
  read("app/api/voice/tts/route.ts"),
  read("app/api/voice/turn/route.ts"),
  read("lib/voice/flux-tts-client.ts"),
  read("app/api/voice/deepgram-token/route.ts"),
  read("lib/transcribe/voice-router.ts"),
  read("components/voice/VoiceMode.module.css"),
  read("app/titan-home.css"),
  read("app/titan-chat.css"),
])

const checks = [
  ["01 empty home composer shows Voice", () => assert.match(home, /prompt\.trim\(\) && "is-hidden"/)],
  ["02 active chat has the same Voice\/Send switch", () => assert.match(chat, /malik-voice-entry[\s\S]*!prompt\.trim\(\) && "is-hidden"/)],
  ["03 switch is smooth and does not resize", () => { assert.match(homeCss, /thome-action-swap[\s\S]*48px[\s\S]*160ms/); assert.match(chatCss, /malik-inline-action-swap[\s\S]*48px[\s\S]*160ms/) }],
  ["04 Enter sends and Shift+Enter stays multiline", () => { assert.match(home, /event\.key === "Enter" && !event\.shiftKey/); assert.match(chat, /event\.key === "Enter" && !event\.shiftKey/); assert.match(dock, /event\.key === "Enter" && !event\.shiftKey/) }],
  ["05 Voice Mode opens in app state from all entry points", () => { assert.match(dashboard, /voiceModeOpen/); assert.match(sidebar, /onOpenVoice\?\.\(\)/); assert.doesNotMatch(mode, /iframe|location\.href|router\.push/) }],
  ["06 full-screen WebGL scene is mounted", () => { assert.match(css, /position:\s*fixed;[\s\S]*inset:\s*0;/); assert.match(orb, /BACKGROUND_FRAGMENT/); assert.match(orb, /ORB_FRAGMENT/) }],
  ["07 microphone uses analyser, VAD and automatic silence submit", () => { assert.match(mode, /getUserMedia/); assert.match(mode, /echoCancellation:\s*true/); assert.match(mode, /noiseSuppression:\s*true/); assert.match(mode, /createAnalyser/); assert.match(mode, /getByteTimeDomainData/); assert.match(mode, /rms >= \.016/); assert.match(mode, /autoSubmitRef\.current/); assert.match(mode, /1050/) }],
  ["08 live browser recognition is multilingual-friendly", () => { assert.match(mode, /webkitSpeechRecognition/); assert.match(mode, /recognition\.lang = navigator\.language \|\| "ru-RU"/); assert.match(mode, /interimResults = true/) }],
  ["09 server STT is auto-language with Gemini 3.5 primary and Whisper fallbacks", () => { assert.match(mode, /form\.append\("language", "auto"\)/); assert.match(transcribe, /gemini-3\.5-transcribe/); assert.match(transcribe, /\["gemini", geminiModel\]/); assert.match(transcribe, /whisper-large-v3-turbo/); assert.match(transcribe, /@cf\/openai\/whisper/) }],
  ["10 screen sharing uses browser API", () => { assert.match(mode, /getDisplayMedia/); assert.match(mode, /getVideoTracks\(\)\[0\]/) }],
  ["11 all 36 Flux voices replace legacy voice roster", () => { assert.match(settings, /36 Deepgram Flux голосов/); for (const name of ["Cliff", "Kit", "Cole", "Colin", "Hannah", "Alexis", "Sienna", "Gemma", "Haley", "Wade", "Wes"]) assert.ok(settings.includes(`name: "${name}"`), `missing Flux voice ${name}`); assert.doesNotMatch(settings, /name: "Sola"/) }],
  ["12 Flux controls expose official speed and expressivity ranges", () => { assert.match(settings, /min="0\.85" max="1\.15" step="0\.05"/); assert.match(settings, /min="-2" max="2" step="1"/); assert.match(mode, /expressivity/); assert.match(flux, /FLUX_SPEEDS|ALLOWED_SPEEDS/) }],
  ["13 secure temporary Deepgram browser token is used", () => { assert.match(token, /api\.deepgram\.com\/v1\/auth\/grant/); assert.match(token, /ttl_seconds:\s*120/); assert.match(token, /DEEPGRAM_VOICE_API_KEY/); assert.match(token, /DEEPGRAM_API_KEY/); assert.doesNotMatch(flux, /DEEPGRAM_API_KEY|DEEPGRAM_VOICE_API_KEY/) }],
  ["14 Flux WebSocket streams raw audio with persistent session context", () => { assert.match(flux, /wss:\/\/api\.deepgram\.com\/v2\/speak/); assert.match(flux, /new WebSocket\([^\n]+\["bearer", token\]\)/); assert.match(flux, /type: "Speak"/); assert.match(flux, /type: "Flush"/); assert.match(flux, /encoding:\s*"linear16"/); assert.match(flux, /sample_rate:\s*String\(SAMPLE_RATE\)/) }],
  ["15 real Flux Interrupt barge-in is wired", () => { assert.match(flux, /type: "Interrupt"/); assert.match(flux, /playback_offset/); assert.match(flux, /SpeechInterrupted/); assert.match(mode, /fluxSessionRef\.current\?\.isSpeaking\(\)/); assert.match(mode, /stopReplyAudio\(true\)/) }],
  ["16 mid-session speed Configure is wired", () => { assert.match(flux, /type: "Configure"/); assert.match(flux, /configureSpeed/); assert.match(mode, /fluxSessionRef\.current\?\.configureSpeed\(speed\)/) }],
  ["17 selected voice is honored: Flux EN, Gemini RU, multilingual KK fallback", () => { assert.match(mode, /language === "en"/); assert.match(tts, /deepgram-flux-batch/); assert.match(tts, /gemini-3\.1-flash-tts-preview/); assert.match(tts, /GEMINI_VOICE_BY_PROFILE/); assert.match(tts, /language === "ru"/); assert.match(tts, /voiceId = "leo"/) }],
  ["18 Kazakh-Russian-English answer language lock is present", () => { assert.match(turn, /type VoiceLanguage = "kk" \| "ru" \| "en"/); assert.match(turn, /Respond ONLY in natural modern Kazakh/); assert.match(turn, /Respond ONLY in natural Russian/); assert.match(turn, /Respond ONLY in natural English/); assert.match(turn, /Never output mixed-script gibberish/) }],
  ["19 REST fallback passes Flux speed and expressivity", () => { assert.match(tts, /speed:\s*String\(speed\)/); assert.match(tts, /expressivity:\s*String\(expressivity\)/); assert.match(mode, /JSON\.stringify\(\{ text, voice: selectedVoice, speed, expressivity \}\)/) }],
  ["20 file, sound, personality and controls are real", () => { assert.match(dock, /type="file"/); assert.match(settings, /Assistant/); assert.match(settings, /type="range"/); assert.match(sound, /createOscillator/); assert.match(dashboard, /playVoiceTransitionSound\("open"\)/); assert.match(mode, /playVoiceTransitionSound\("close"\)/) }],
  ["21 Esc and unmount release resources", () => { assert.match(mode, /event\.key === "Escape"/); assert.match(mode, /getTracks\(\)\.forEach\(\(track\) => track\.stop\(\)\)/); assert.match(mode, /context\.close\(\)/); assert.match(mode, /fluxSessionRef\.current\?\.close\(\)/); assert.match(orb, /WEBGL_lose_context/) }],
  ["22 responsive layout and DPR caps are present", () => { assert.match(css, /@media \(max-width: 680px\)/); assert.match(css, /@media \(max-width: 450px\)/); assert.match(orb, /resize\(background, backgroundCanvas, 1\.6\)/); assert.match(orb, /resize\(orb, orbCanvas, 2\)/) }],
  ["23 iPhone blob playback fallback remains available", () => { assert.match(sound, /HTMLMediaElement\.prototype/); assert.match(sound, /sourceUrl\.startsWith\("blob:"\)/); assert.match(sound, /decodeAudioData/); assert.match(sound, /dispatchEvent\(new Event\("ended"\)\)/) }],
]

for (const [name, check] of checks) {
  check()
  console.log(`${name} -> PASS`)
}

console.log(`Voice Mode verification: ${checks.length}/${checks.length} PASS`)
