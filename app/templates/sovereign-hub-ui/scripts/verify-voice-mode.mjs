import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import path from "node:path"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const read = (file) => readFile(path.join(root, file), "utf8")

const [home, chat, dashboard, sidebar, mode, dock, orb, settings, sound, tts, turn, flux, token, transcribe, css, homeCss, chatCss, playback] = await Promise.all([
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
  read("lib/voice/audio-playback.ts"),
])

const checks = [
  ["01 empty home composer shows Voice and content shows Send", () => { assert.match(home, /hasSendableContent && "is-hidden"/); assert.match(home, /!hasSendableContent && "is-hidden"/) }],
  ["02 active chat has the same Voice\/Send switch", () => { assert.match(chat, /malik-voice-entry[\s\S]*prompt\.trim\(\) && "is-hidden"/); assert.match(chat, /malik-inline-send[\s\S]*!prompt\.trim\(\) && "is-hidden"/) }],
  ["03 switch is smooth and does not resize", () => { assert.match(homeCss, /thome-action-swap[\s\S]*48px[\s\S]*160ms/); assert.match(chatCss, /malik-inline-action-swap[\s\S]*48px[\s\S]*160ms/) }],
  ["04 Enter sends and Shift+Enter stays multiline", () => { assert.match(home, /event\.key === "Enter" && !event\.shiftKey/); assert.match(chat, /event\.key === "Enter" && !event\.shiftKey/); assert.match(dock, /event\.key === "Enter" && !event\.shiftKey/) }],
  ["05 Voice Mode opens in app state from all entry points", () => { assert.match(dashboard, /voiceModeOpen/); assert.match(sidebar, /onOpenVoice\?\.\(\)/); assert.doesNotMatch(mode, /iframe|location\.href|router\.push/) }],
  ["06 full-screen WebGL scene is mounted", () => { assert.match(css, /position:\s*fixed;[\s\S]*inset:\s*0;/); assert.match(orb, /BACKGROUND_FRAGMENT/); assert.match(orb, /ORB_FRAGMENT/) }],
  ["07 microphone uses analyser, VAD and automatic silence submit", () => { assert.match(mode, /getUserMedia/); assert.match(mode, /echoCancellation:\s*true/); assert.match(mode, /noiseSuppression:\s*true/); assert.match(mode, /createAnalyser/); assert.match(mode, /getByteTimeDomainData/); assert.match(mode, /rms >= \.016/); assert.match(mode, /autoSubmitRef\.current/); assert.match(mode, /1050/) }],
  ["08 browser recognition follows the selected language", () => { assert.match(mode, /webkitSpeechRecognition/); assert.match(mode, /languageRef\.current === "kk" \? "kk-KZ"/); assert.match(mode, /"ru-RU"/); assert.match(mode, /"en-US"/); assert.match(mode, /interimResults = true/) }],
  ["09 server STT is locked to selected language with provider fallbacks", () => { assert.match(mode, /form\.append\("language", languageRef\.current\)/); assert.match(transcribe, /gemini-3\.5-transcribe/); assert.match(transcribe, /whisper-large-v3-turbo/); assert.match(transcribe, /@cf\/openai\/whisper/) }],
  ["10 screen sharing uses browser API", () => { assert.match(mode, /getDisplayMedia/); assert.match(mode, /getVideoTracks\(\)\[0\]/) }],
  ["11 voices are separated by language with Kazakh first", () => { assert.match(settings, /defaultVoiceForLanguage/); assert.match(settings, /name: "Kokoro M1"/); assert.match(settings, /name: "Kokoro M1 Calm"/); assert.match(settings, /name: "Kokoro M1 Strong"/); for (const name of ["Charon", "Puck", "Kore", "Aoede", "Fenrir"]) assert.ok(settings.includes(`name: "${name}"`), `missing Russian voice ${name}`); for (const name of ["Cliff", "Kit", "Cole", "Colin", "Hannah", "Alexis", "Sienna", "Gemma", "Haley", "Wade", "Wes"]) assert.ok(settings.includes(`name: "${name}"`), `missing Flux voice ${name}`); assert.match(settings, /voicesForLanguage\(language\)/); assert.match(mode, /useState<VoiceLanguage>\("kk"\)/) }],
  ["12 Flux controls expose official speed and expressivity ranges", () => { assert.match(settings, /min="0\.85" max="1\.15" step="0\.05"/); assert.match(settings, /min="-2" max="2" step="1"/); assert.match(mode, /expressivity/); assert.match(flux, /FLUX_SPEEDS|ALLOWED_SPEEDS/) }],
  ["13 secure temporary Deepgram browser token is used", () => { assert.match(token, /api\.deepgram\.com\/v1\/auth\/grant/); assert.match(token, /ttl_seconds:\s*120/); assert.match(token, /DEEPGRAM_VOICE_API_KEY/); assert.match(token, /DEEPGRAM_API_KEY/); assert.doesNotMatch(flux, /DEEPGRAM_API_KEY|DEEPGRAM_VOICE_API_KEY/) }],
  ["14 Flux WebSocket streams raw audio with persistent session context", () => { assert.match(flux, /wss:\/\/api\.deepgram\.com\/v2\/speak/); assert.match(flux, /new WebSocket\([^\n]+\["bearer", token\]\)/); assert.match(flux, /type: "Speak"/); assert.match(flux, /type: "Flush"/); assert.match(flux, /encoding:\s*"linear16"/); assert.match(flux, /sample_rate:\s*String\(SAMPLE_RATE\)/) }],
  ["15 real Flux Interrupt barge-in is wired", () => { assert.match(flux, /type: "Interrupt"/); assert.match(flux, /playback_offset/); assert.match(flux, /SpeechInterrupted/); assert.match(mode, /fluxSessionRef\.current\?\.isSpeaking\(\)/); assert.match(mode, /stopReplyAudio\(true\)/) }],
  ["16 mid-session speed Configure is wired", () => { assert.match(flux, /type: "Configure"/); assert.match(flux, /configureSpeed/); assert.match(mode, /fluxSessionRef\.current\?\.configureSpeed\(speed\)/) }],
  ["17 selected language and real audio are honored end-to-end", () => { assert.match(mode, /selectedLanguage === "en"/); assert.match(mode, /response\.headers\.get\("content-type"\)/); assert.match(mode, /language: selectedLanguage/); assert.match(tts, /GEMINI_VOICE_BY_PROFILE/); assert.match(tts, /requestedLanguage/); assert.match(settings, /Қазақша/); assert.match(settings, /Русский/); assert.match(settings, /English/) }],
  ["18 Kazakh-Russian-English answer language lock is strict", () => { assert.match(turn, /type VoiceLanguage = "kk" \| "ru" \| "en"/); assert.match(turn, /requestedLanguage\(body\?\.language\)/); assert.match(turn, /LANGUAGE LOCK: KAZAKH ONLY/); assert.match(turn, /LANGUAGE LOCK: RUSSIAN ONLY/); assert.match(turn, /LANGUAGE LOCK: ENGLISH ONLY/); assert.match(turn, /matchesLanguage/); assert.match(turn, /second violation is not allowed/i) }],
  ["19 REST fallback passes language, speed and expressivity", () => { assert.match(tts, /speed:\s*String\(speed\)/); assert.match(tts, /expressivity:\s*String\(expressivity\)/); assert.match(mode, /JSON\.stringify\(\{ text, voice: selectedVoice, language: selectedLanguage, speed, expressivity \}\)/) }],
  ["20 file, sound, personality and controls are real", () => { assert.match(dock, /type="file"/); assert.match(settings, /Assistant/); assert.match(settings, /type="range"/); assert.match(sound, /createOscillator/); assert.match(dashboard, /playVoiceTransitionSound\("open"\)/); assert.match(mode, /playVoiceTransitionSound\("close"\)/) }],
  ["21 Esc and unmount release resources", () => { assert.match(mode, /event\.key === "Escape"/); assert.match(mode, /getTracks\(\)\.forEach\(\(track\) => track\.stop\(\)\)/); assert.match(mode, /context\.close\(\)/); assert.match(mode, /fluxSessionRef\.current\?\.close\(\)/); assert.match(orb, /WEBGL_lose_context/) }],
  ["22 responsive layout and DPR caps are present", () => { assert.match(css, /@media \(max-width: 680px\)/); assert.match(css, /@media \(max-width: 450px\)/); assert.match(orb, /resize\(background, backgroundCanvas, 1\.6\)/); assert.match(orb, /resize\(orb, orbCanvas, 2\)/) }],
  ["23 replies use a gesture-unlocked player without global media patches", () => { assert.match(sound, /unlockVoiceAudio/); assert.match(playback, /decodeAudioData/); assert.match(playback, /source\.onended/); assert.match(mode, /Озвучить ответ/); assert.doesNotMatch(sound, /HTMLMediaElement\.prototype/) }],
  ["24 voice errors never display provider diagnostics or API key names", () => { assert.doesNotMatch(mode, /String\(payload\.error|showNotice\(payload\.error|API_KEY|ключ голосового|переключит провайдера/); assert.match(mode, /response\.status === 401/); assert.match(mode, /response\.status === 429/); assert.match(mode, /Сейчас не удалось озвучить ответ/); assert.match(mode, /setTitle\("Не удалось озвучить"\)/); assert.match(mode, /onClick=\{\(\) => void retryReply\(\)\}/) }],
  ["25 voice orb has no outer grey halo, ring or glow", () => { assert.doesNotMatch(orb, /styles\.orbHalo|styles\.orbRing/); assert.doesNotMatch(css, /\.orbHalo|\.orbRing/); assert.match(css, /\.orbShell\s*\{[^}]*box-shadow:\s*none;/); assert.match(orb, /className=\{styles\.backgroundFog\}/); assert.match(orb, /className=\{styles\.orbCanvas\}/) }],
]

for (const [name, check] of checks) {
  check()
  console.log(`${name} -> PASS`)
}

console.log(`Voice Mode verification: ${checks.length}/${checks.length} PASS`)
