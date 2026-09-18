import assert from "node:assert/strict"
import fs from "node:fs"

const route = fs.readFileSync("app/api/stream/route-impl.ts", "utf8")
const router = fs.readFileSync("lib/server/multimodal-router.ts", "utf8")
const gemini = fs.readFileSync("lib/server/hidden-gemini-multimodal.ts", "utf8")
const quota = fs.readFileSync("lib/server/daily-multimodal-quota.ts", "utf8")
const chat = fs.readFileSync("components/sovereign/chat-view.tsx", "utf8")
const modelRouter = fs.readFileSync("lib/server/malik-model-router.ts", "utf8")
const env = fs.readFileSync(".env.example", "utf8")

assert.match(route, /routeMalikAttachments/, "Main /api/stream route must preprocess attachments")
assert.match(route, /MULTIMODAL_DAILY_LIMIT_REACHED/, "Main route must enforce the multimodal daily allowance")
assert.match(route, /freeDailyMultimodalTokens/, "Stream health payload must expose the multimodal daily allowance")

assert.match(router, /qwen\/qwen3\.8-27b/, "Groq Qwen vision reserve must exist")
assert.match(router, /@cf\/google\/gemma-4-26b-a4b-it/, "Cloudflare Gemma vision reserve must exist")
assert.match(router, /@cf\/qwen\/qwen3\.8-27b/, "Cloudflare Qwen vision reserve must exist")
assert.match(router, /docx/, "DOCX local extraction must exist")
assert.match(router, /xlsx/, "XLSX local extraction must exist")
assert.match(router, /pptx/, "PPTX local extraction must exist")
assert.match(router, /transcribeAudio/, "Groq Whisper audio fallback must exist")

assert.match(gemini, /gemini-3\.5-flash-lite/, "Gemini Flash-Lite must be the default multimodal model")
assert.match(gemini, /gemini-3\.5-flash/, "Gemini Flash fallback must exist")
assert.match(gemini, /application\/pdf/, "Gemini route must accept PDF")

assert.match(quota, /MALIK_MULTIMODAL_DAILY_TOKENS \|\| 30_000/, "Default multimodal allowance must be 30K/day")
assert.match(chat, /MAX_INLINE_TEXT_CHARS/, "Text/code uploads should travel as text instead of wasteful base64")
assert.match(chat, /CODE_UPLOAD_EXTENSIONS/, "Code uploads should be classified separately")
assert.match(modelRouter, /CLOUDFLARE_AUTH_TOKEN/, "Render Cloudflare token alias must be accepted")

for (const key of [
  "MALIK_MULTIMODAL_DAILY_TOKENS=30000",
  "GEMINI_VISION_MODEL=gemini-3.5-flash-lite",
  "GEMINI_FALLBACK_MODEL=gemini-3.5-flash",
  "GROQ_VISION_MODEL=qwen/qwen3.8-27b",
  "GROQ_WHISPER_MODEL=whisper-large-v3-turbo",
  "CLOUDFLARE_AUTH_TOKEN=",
  "CLOUDFLARE_VISION_MODEL=@cf/google/gemma-4-26b-a4b-it",
]) {
  assert.ok(env.includes(key), `.env.example missing ${key}`)
}

console.log("Malik multimodal router wiring verified.")
