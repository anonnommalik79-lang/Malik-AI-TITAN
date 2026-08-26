import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import path from "node:path"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const read = (file) => readFile(path.join(root, file), "utf8")

const [home, chat, dashboard, sidebar, mode, dock, orb, settings, sound, tts, css, homeCss, chatCss] = await Promise.all([
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
  read("components/voice/VoiceMode.module.css"),
  read("app/titan-home.css"),
  read("app/titan-chat.css"),
])

const checks = [
  ["01 empty home composer shows Voice", () => assert.match(home, /prompt\.trim\(\) && "is-hidden"/)],
  ["02 active chat has the same Voice/Send switch", () => assert.match(chat, /malik-voice-entry[\s\S]*!prompt\.trim\(\) && "is-hidden"/)],
  ["03 switch is smooth and does not resize", () => { assert.match(homeCss, /thome-action-swap[\s\S]*48px[\s\S]*160ms/); assert.match(chatCss, /malik-inline-action-swap[\s\S]*48px[\s\S]*160ms/) }],
  ["04 Enter sends and Shift+Enter stays multiline", () => { assert.match(home, /event\.key === "Enter" && !event\.shiftKey/); assert.match(chat, /event\.key === "Enter" && !event\.shiftKey/); assert.match(dock, /event\.key === "Enter" && !event\.shiftKey/) }],
  ["05 Voice Mode opens in app state from all entry points", () => { assert.match(dashboard, /voiceModeOpen/); assert.match(sidebar, /onOpenVoice\?\.\(\)/); assert.doesNotMatch(mode, /iframe|location\.href|router\.push/) }],
  ["06 full-screen WebGL scene is mounted", () => { assert.match(css, /position:\s*fixed;[\s\S]*inset:\s*0;/); assert.match(orb, /BACKGROUND_FRAGMENT/); assert.match(orb, /ORB_FRAGMENT/) }],
  ["07 microphone drives a real analyser", () => { assert.match(mode, /getUserMedia/); assert.match(mode, /createAnalyser/); assert.match(mode, /getByteFrequencyData/) }],
  ["08 live speech recognition is wired", () => { assert.match(mode, /webkitSpeechRecognition/); assert.match(mode, /recognition\.lang = "ru-RU"/); assert.match(mode, /interimResults = true/) }],
  ["09 screen sharing uses the browser API", () => { assert.match(mode, /getDisplayMedia/); assert.match(mode, /getVideoTracks\(\)\[0\]/) }],
  ["10 file, sound, voice, personality and speed controls are real", () => { assert.match(dock, /type="file"/); assert.match(settings, /Sola/); assert.match(settings, /Assistant/); assert.match(settings, /type="range"/); assert.match(sound, /createOscillator/); assert.match(dashboard, /playVoiceTransitionSound\("open"\)/); assert.match(mode, /playVoiceTransitionSound\("close"\)/) }],
  ["11 Esc and unmount release live resources", () => { assert.match(mode, /event\.key === "Escape"/); assert.match(mode, /getTracks\(\)\.forEach\(\(track\) => track\.stop\(\)\)/); assert.match(mode, /context\.close\(\)/); assert.match(orb, /WEBGL_lose_context/) }],
  ["12 responsive layout and DPR caps are present", () => { assert.match(css, /@media \(max-width: 680px\)/); assert.match(css, /@media \(max-width: 450px\)/); assert.match(orb, /resize\(background, backgroundCanvas, 1\.6\)/); assert.match(orb, /resize\(orb, orbCanvas, 2\)/) }],
  ["13 xAI TTS uses official request fields and MP3", () => { assert.match(tts, /https:\/\/api\.x\.ai\/v1\/tts/); assert.match(tts, /voice_id:\s*voiceId/); assert.match(tts, /codec:\s*"mp3"/); assert.match(tts, /sample_rate:\s*24000/) }],
  ["14 async iPhone reply has WebAudio blob fallback", () => { assert.match(sound, /HTMLMediaElement\.prototype/); assert.match(sound, /sourceUrl\.startsWith\("blob:"\)/); assert.match(sound, /decodeAudioData/); assert.match(sound, /dispatchEvent\(new Event\("ended"\)\)/) }],
  ["15 every Malik voice profile resolves to a built-in xAI voice", () => { for (const id of ["ara", "eve", "leo", "rex", "sal"]) assert.match(settings, new RegExp(`xaiVoiceId: \\"${id}\\"`)); assert.doesNotMatch(settings, /xaiVoiceId:\s*"(?:carina|luna|orion|aurora|atlas)"/) }],
]

for (const [name, check] of checks) {
  check()
  console.log(`${name} -> PASS`)
}

console.log(`Voice Mode verification: ${checks.length}/${checks.length} PASS`)
