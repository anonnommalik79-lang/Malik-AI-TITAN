// Calls the REAL deployed route, saves its returned audio, optionally sends that
// audio to the REAL STT route. Never treats a text response or HTTP 200 as speech.
import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const base = process.argv[2] || process.env.VOICE_TEST_BASE_URL
if (!base) {
  console.error("BLOCKED: pass your running app URL: npm run test:voice:live -- https://YOUR-APP (no provider keys in this command).")
  process.exit(2)
}
const language = process.env.VOICE_TEST_LANGUAGE || "ru"
const samples = {
  ru: { text: "Привет! Это проверка голоса Malik AI. Я слышу тебя и отвечаю вслух.", voice: "Charon" },
  en: { text: "Hello! This is the Malik AI voice check. I hear you and answer aloud.", voice: "Cliff" },
  kk: { text: "Сәлем! Бұл Malik AI дауысын тексеру. Мен сені тыңдап тұрмын.", voice: "Kokoro M1" },
}
const sample = samples[language]
if (!sample) throw new Error("VOICE_TEST_LANGUAGE must be ru, en or kk")
// A real signed-in session can be supplied via env. Otherwise use the app's
// existing public guest access, never fabricate an authenticated account.
let cookie = process.env.VOICE_TEST_COOKIE || "malik-guest=1"
const started = Date.now()
const response = await fetch(new URL("/api/voice/tts", base), {
  method: "POST", headers: { "content-type": "application/json", cookie },
  body: JSON.stringify({ ...sample, language, speed: 1, expressivity: 0 }),
  signal: AbortSignal.timeout(65000),
})
const mime = response.headers.get("content-type") || ""
if (!response.ok || !mime.startsWith("audio/")) {
  console.error(`FAIL: TTS returned HTTP ${response.status}, ${mime || "no audio content type"}. No spoken audio verified.`)
  process.exit(1)
}
for (const item of response.headers.getSetCookie()) cookie += "; " + item.split(";")[0]
const bytes = Buffer.from(await response.arrayBuffer())
if (bytes.length < 256) throw new Error("FAIL: audio response is empty/truncated")
let duration = 0
if (bytes.toString("ascii", 0, 4) === "RIFF") {
  const channels = bytes.readUInt16LE(22), rate = bytes.readUInt32LE(24), bits = bytes.readUInt16LE(34)
  let offset = 12, data
  while (offset + 8 <= bytes.length) {
    const size = bytes.readUInt32LE(offset + 4)
    if (bytes.toString("ascii", offset, offset + 4) === "data") { data = bytes.subarray(offset + 8, offset + 8 + size); break }
    offset += 8 + size + (size % 2)
  }
  if (!data || bits !== 16) throw new Error("FAIL: unsupported or malformed WAV")
  let energy = 0
  for (let i = 0; i + 1 < data.length; i += 2) energy += (data.readInt16LE(i) / 32768) ** 2
  if (Math.sqrt(energy / (data.length / 2)) < 0.0001) throw new Error("FAIL: generated WAV is silent")
  duration = data.length / (rate * channels * bits / 8)
  if (duration < 0.25) throw new Error("FAIL: speech audio too short")
}
const directory = path.join(root, ".voice-check")
await fs.mkdir(directory, { recursive: true })
const output = path.join(directory, `voice-${language}.${mime.includes("wav") ? "wav" : "mp3"}`)
await fs.writeFile(output, bytes)
console.log(JSON.stringify({ provider: response.headers.get("x-malik-tts-provider"), bytes: bytes.length, durationSeconds: duration || null, latencyMs: Date.now() - started, audioFile: output }))
if (process.env.VOICE_TEST_TRANSCRIBE === "1") {
  const form = new FormData()
  form.append("file", new Blob([bytes], { type: mime }), path.basename(output))
  form.append("language", language)
  form.append("durationSec", String(Math.max(1, duration || 10)))
  const stt = await fetch(new URL("/api/transcribe", base), { method: "POST", headers: { cookie }, body: form, signal: AbortSignal.timeout(65000) })
  const result = await stt.json()
  if (!stt.ok || !result.ok || !result.text) throw new Error(`FAIL: real speech recognition returned HTTP ${stt.status}`)
  console.log("Real STT heard: " + result.text)
}
console.log("Audio received. Device speaker playback must still be checked by listening; this script does not verify browser autoplay.")
