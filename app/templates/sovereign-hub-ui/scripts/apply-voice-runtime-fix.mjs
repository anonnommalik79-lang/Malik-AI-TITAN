import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

async function replaceOnce(relativePath, oldText, newText, label) {
  const file = path.join(root, relativePath)
  const source = await readFile(file, "utf8")
  if (!source.includes(oldText)) throw new Error(`Missing expected block: ${label} in ${relativePath}`)
  await writeFile(file, source.replace(oldText, newText), "utf8")
}

async function replaceTokens(relativePath, pairs) {
  const file = path.join(root, relativePath)
  let source = await readFile(file, "utf8")
  for (const [oldText, newText] of pairs) {
    if (!source.includes(oldText)) throw new Error(`Missing token in ${relativePath}: ${oldText}`)
    source = source.replace(oldText, newText)
  }
  await writeFile(file, source, "utf8")
}

await replaceTokens("app/api/voice/tts/route.ts", [
  ['Sola: "ara"', 'Sola: "rex"'],
  ['Carina: "ara"', 'Carina: "carina"'],
  ['Luna: "eve"', 'Luna: "luna"'],
  ['Orion: "leo"', 'Orion: "orion"'],
  ['Aurora: "eve"', 'Aurora: "aurora"'],
  ['Atlas: "rex"', 'Atlas: "atlas"'],
  ['const voiceId = XAI_VOICES[voice] || "ara"', 'const voiceId = XAI_VOICES[voice] || "rex"'],
  ['sample_rate: 24000,', 'sample_rate: 44100,'],
  ['bit_rate: 128000,', 'bit_rate: 192000,'],
  [
`      output_format: {
        codec: "mp3",
        sample_rate: 44100,
        bit_rate: 192000,
      },`,
`      output_format: {
        codec: "mp3",
        sample_rate: 44100,
        bit_rate: 192000,
      },
      speed: 0.98,
      text_normalization: true,
      optimize_streaming_latency: 0,`
  ],
])

await replaceTokens("components/voice/VoiceSettings.tsx", [
  [
    '{ name: "Sola", description: "Warm, natural and clear.", xaiVoiceId: "ara", rate: 1.00, pitch: 1.02, hints: ["natural", "female", "samantha", "google"] }',
    '{ name: "Sola", description: "Clean, confident and clear.", xaiVoiceId: "rex", rate: .98, pitch: .86, hints: ["male", "david", "guy", "daniel", "alex", "mark"] }',
  ],
  ['xaiVoiceId: "ara", rate: .92', 'xaiVoiceId: "carina", rate: .92'],
  ['xaiVoiceId: "eve", rate: .97', 'xaiVoiceId: "luna", rate: .97'],
  ['xaiVoiceId: "leo", rate: .94', 'xaiVoiceId: "orion", rate: .94'],
  ['xaiVoiceId: "eve", rate: 1.03', 'xaiVoiceId: "aurora", rate: 1.03'],
  ['xaiVoiceId: "rex", rate: .93', 'xaiVoiceId: "atlas", rate: .93'],
])

const oldSpeakReply = `  const speakReply = useCallback(async (text: string) => {
    if (!soundEnabled || !text.trim()) return
    stopReplyAudio()
    try {
      const response = await fetch("/api/voice/tts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text, voice }),
      })
      const provider = response.headers.get("x-malik-tts-provider")
      if (response.ok && (provider === "xai" || (provider === "cloudflare" && voice === "Sola"))) {
        const blob = await response.blob()
        if (blob.size > 128) {
          const url = URL.createObjectURL(blob)
          await new Promise<void>((resolve) => {
            const audio = new Audio(url)
            replyAudioRef.current = audio
            audio.playbackRate = Math.max(.75, Math.min(1.3, speedRef.current))
            audio.onended = () => { URL.revokeObjectURL(url); replyAudioRef.current = null; resolve() }
            audio.onerror = () => { URL.revokeObjectURL(url); replyAudioRef.current = null; resolve() }
            void audio.play().catch(() => resolve())
          })
          return
        }
      }
    } catch {}
    await speakBrowser(text, voice)
  }, [soundEnabled, speakBrowser, stopReplyAudio, voice])`

const newSpeakReply = `  const speakReply = useCallback(async (text: string) => {
    if (!soundEnabled || !text.trim()) return false
    stopReplyAudio()
    try {
      const response = await fetch("/api/voice/tts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text, voice }),
      })
      const provider = response.headers.get("x-malik-tts-provider")
      if (response.ok && (provider === "xai" || provider === "cloudflare")) {
        const blob = await response.blob()
        if (blob.size > 128) {
          const url = URL.createObjectURL(blob)
          const played = await new Promise<boolean>((resolve) => {
            const audio = new Audio(url)
            let settled = false
            const settle = (ok: boolean) => {
              if (settled) return
              settled = true
              URL.revokeObjectURL(url)
              if (replyAudioRef.current === audio) replyAudioRef.current = null
              resolve(ok)
            }
            replyAudioRef.current = audio
            audio.preload = "auto"
            audio.volume = 1
            audio.playbackRate = Math.max(.8, Math.min(1.18, speedRef.current))
            audio.setAttribute("playsinline", "true")
            audio.onended = () => settle(true)
            audio.onerror = () => settle(false)
            const timeout = window.setTimeout(() => settle(false), 120000)
            const clear = () => window.clearTimeout(timeout)
            audio.addEventListener("ended", clear, { once: true })
            audio.addEventListener("error", clear, { once: true })
            void audio.play().catch(() => { clear(); settle(false) })
          })
          if (played) return true
        }
      }
    } catch {}

    const browserPlayed = await speakBrowser(text, voice)
    if (!browserPlayed) showNotice("Не удалось воспроизвести Voice-ответ")
    return browserPlayed
  }, [soundEnabled, showNotice, speakBrowser, stopReplyAudio, voice])`

await replaceOnce("components/voice/VoiceMode.tsx", oldSpeakReply, newSpeakReply, "VoiceMode speakReply")

await replaceTokens("scripts/verify-voice-mode.mjs", [
  [
    '["13 xAI TTS uses official request fields and MP3", () => { assert.match(tts, /https:\\/\\/api\\.x\\.ai\\/v1\\/tts/); assert.match(tts, /voice_id:\\s*voiceId/); assert.match(tts, /codec:\\s*"mp3"/); assert.match(tts, /sample_rate:\\s*24000/) }],',
    '["13 xAI TTS uses high-fidelity official MP3 output", () => { assert.match(tts, /https:\\/\\/api\\.x\\.ai\\/v1\\/tts/); assert.match(tts, /voice_id:\\s*voiceId/); assert.match(tts, /codec:\\s*"mp3"/); assert.match(tts, /sample_rate:\\s*44100/); assert.match(tts, /bit_rate:\\s*192000/) }],',
  ],
  [
    '["15 every Malik voice profile resolves to a built-in xAI voice", () => { for (const id of ["ara", "eve", "leo", "rex", "sal"]) assert.ok(settings.includes(`xaiVoiceId: "${id}"`), `missing xAI voice ${id}`); assert.doesNotMatch(settings, /xaiVoiceId:\\s*"(?:carina|luna|orion|aurora|atlas)"/) }],',
    '["15 Malik profiles use current built-in xAI voices", () => { for (const id of ["rex", "eve", "leo", "sal", "carina", "luna", "orion", "aurora", "atlas"]) assert.ok(settings.includes(`xaiVoiceId: "${id}"`), `missing xAI voice ${id}`); assert.match(settings, /name: "Sola"[\\s\\S]*xaiVoiceId: "rex"/) }],\n  ["16 failed remote playback falls through instead of going silent", () => { assert.match(mode, /const played = await new Promise<boolean>/); assert.match(mode, /if \\(played\\) return true/); assert.match(mode, /const browserPlayed = await speakBrowser/); assert.match(mode, /provider === "xai" \\|\\| provider === "cloudflare"/) }],',
  ],
])

console.log("Voice runtime repair applied")
