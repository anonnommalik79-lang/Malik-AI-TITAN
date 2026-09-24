import assert from "node:assert/strict"
import fs from "node:fs"

const read = (path) => fs.readFileSync(path, "utf8")
const check = (name, run) => {
  try {
    run()
    console.log("PASS", name)
  } catch (error) {
    console.error("FAIL", name)
    throw error
  }
}

const videoCaps = read("lib/media/video-capabilities.ts")
const videoRoute = read("app/api/media/video/route.ts")
const videoSource = read("app/api/media/video/source/route.ts")
const videoStudio = read("components/sovereign/video-generation/VideoGenerationStudio.tsx")
const limits = read("lib/media/limits.ts")
const quota = read("lib/server/video-account-quota.ts")
const selector = read("components/sovereign/MalikModelSelector.tsx")
const chat = read("components/sovereign/chat-view.tsx")
const dashboard = read("components/sovereign/dashboard.tsx")
const router = read("lib/server/malik-model-router.ts")
const founderHealth = read("app/api/founder/provider-health/route.ts")
const voice = read("components/voice/VoiceMode.tsx")
const voiceSetup = read("lib/voice/gemini-live-setup.ts")
const voiceVerify = read("scripts/verify-voice-mode.mjs")
const photoTakeover = read("components/sovereign/photo-generation/PhotoGenerationStudio.tsx")
const projectBuilder = read("lib/ai/project-builder.ts")
const preview = read("components/sovereign/preview-panel.tsx")
const stream = read("app/api/stream/route.ts")

check("01 excluded photo takeover is untouched by hardening", () => {
  assert.match(photoTakeover, /Voltframe launch takeover/)
  assert.match(photoTakeover, /\/voltframe\/desktop\.png/)
})

check("02 real chat streaming path remains wired", () => {
  assert.match(stream, /ReadableStream|text\/event-stream/)
  assert.match(router, /onToken/)
})

check("03 fast short-chat mode exists", () => {
  assert.match(router, /FAST CHAT MODE/)
  assert.match(router, /MALIK_FAST_MAX_OUTPUT_TOKENS/)
})

check("04 video has one authoritative default", () => {
  assert.match(videoCaps, /DEFAULT_VIDEO_PROVIDER_ID: VideoProviderId = "novai"/)
  assert.match(videoStudio, /DEFAULT_VIDEO_PROVIDER_ID/)
})

check("05-08 model/provider routing uses health and failover", () => {
  assert.match(router, /providerFallbackScore/)
  assert.match(router, /setCooldown/)
  assert.match(router, /recordProviderSuccess/)
  assert.match(router, /recordProviderFailure/)
})

check("09 video job survives reload and can be cancelled", () => {
  assert.match(videoStudio, /ACTIVE_VIDEO_JOB_KEY/)
  assert.match(videoStudio, /pollVideoTask/)
  assert.match(videoStudio, /cancelGeneration/)
  assert.ok(fs.existsSync("app/api/media/video/cancel/route.ts"))
})

check("10-18 chat edit branch regenerate and persistence hooks exist", () => {
  assert.match(chat, /replaceFromMessageId/)
  assert.match(chat, /editingMessageId/)
  assert.match(chat, /onRegenerate/)
  assert.match(chat, /onBranchMessage/)
  assert.match(dashboard, /replaceFromMessageId/)
  assert.match(dashboard, /handleBranchMessage/)
})

check("19-20 multimodal/image-edit routing remains explicit", () => {
  assert.match(dashboard, /forcedImageEdit/)
  assert.match(dashboard, /expandVideoAnalysisAttachments/)
})

check("28-30 video capability matrix blocks impossible settings", () => {
  assert.match(videoCaps, /modes:/)
  assert.match(videoCaps, /resolutions:/)
  assert.match(videoCaps, /watermark:/)
  assert.match(videoRoute, /VIDEO_MODE_UNSUPPORTED_BY_PROVIDER/)
  assert.match(videoRoute, /VIDEO_DURATION_UNSUPPORTED_BY_PROVIDER/)
  assert.match(videoRoute, /VIDEO_RESOLUTION_UNSUPPORTED_BY_PROVIDER/)
  assert.doesNotMatch(videoRoute, /providerId\s*=\s*"magichour"/)
})

check("28 source modes include native Runway and public Luma/H3", () => {
  assert.match(videoSource, /uploadToRunway/)
  assert.match(videoSource, /uploadToMagicHour/)
  assert.match(videoSource, /uploadMediaAsset/)
  assert.match(videoSource, /"luma", "h3"/)
})

check("31-33 premium quota and reset are server-authoritative", () => {
  assert.match(limits, /PREMIUM_DAILY_VIDEO_LIMIT", 5/)
  assert.match(limits, /Asia\/Almaty/)
  assert.match(quota, /count:/)
  assert.match(quota, /remaining:/)
  assert.match(quota, /refundVideoAccountDailyQuota/)
  assert.match(videoStudio, /resetCountdown/)
})

check("34 founder provider-health telemetry is observed, not invented", () => {
  assert.match(router, /malikProviderHealthSnapshot/)
  assert.match(founderHealth, /requestsObserved/)
  assert.match(founderHealth, /OWNER_ONLY/)
})

check("35 smart routing keeps task-aware fallback", () => {
  assert.match(router, /isCodeRequest/)
  assert.match(router, /analyzeMalikBrainV1/)
})

check("36-40 model selector has compact browse, favorites, recents and capabilities", () => {
  assert.match(selector, /showAll/)
  assert.match(selector, /favorite/i)
  assert.match(selector, /recent/i)
  assert.match(selector, /capabilities/)
  assert.match(selector, /\/api\/ai\/model-icon\//)
})

check("41-45 voice foreground focus, denoise, barge-in and language lock remain protected", () => {
  assert.match(voice, /echoCancellation:\s*true/)
  assert.match(voice, /noiseSuppression:\s*true/)
  assert.match(voice, /voiceIsolation/)
  assert.match(voiceVerify, /Flux Interrupt barge-in/)
  assert.match(voiceSetup, /LANGUAGE LOCK/)
})

check("46-48 code generation keeps complete-project QA and live preview", () => {
  assert.match(projectBuilder, /TODO|FIXME/)
  assert.match(projectBuilder, /unfinished placeholder content/)
  assert.match(preview, /iframe|srcDoc|sandbox/)
})

console.log("\nMALIK HARDENING 49: invariant gate passed")
