import { CAPABILITIES, EXPECTED_CAPABILITY_COUNT } from "@/lib/ai/capabilities/registry"
import { getSafeEnvSnapshot } from "@/lib/ai/env"
import { FOUNDER_LINE, HONEST_POSITIONING, PROFESSIONAL_DISCLAIMER, STAGE_LINE } from "@/lib/ai/safety"

export const PROOF_CONTACT_EMAIL = "hello@malik.ai"

export const PROOF_NAV = [
  { href: "/demo", label: "Demo" },
  { href: "/status", label: "Status" },
  { href: "/benchmarks", label: "Benchmarks" },
  { href: "/press-kit", label: "Press kit" },
  { href: "/security", label: "Security" },
  { href: "/contact", label: "Contact" },
  { href: "/media", label: "Media" },
  { href: "/investors", label: "Investors" },
  { href: "/founder", label: "Founder" },
  { href: "/capabilities", label: "Capabilities" },
  { href: "/dashboard", label: "App" },
] as const

export const KAZAKHSTAN_IMPACT = [
  { title: "AI for students", detail: "Exam prep, essay help, programming tutor and multilingual study support." },
  { title: "AI for startups", detail: "MVP planning, pitch drafts, investor Q&A prep and launch checklists." },
  { title: "AI for small business", detail: "Offers, proposals, customer messaging and document summaries." },
  { title: "AI for documents", detail: "PDF summaries, letters, reports and bureaucracy document helpers." },
  { title: "Kazakh / Russian / English", detail: "Multilingual drafts and localization workflows in one command center." },
  { title: "Local AI ecosystem growth", detail: "Open builder tooling for Astana Hub, Digital Bridge and regional founders." },
] as const

export const DEMO_FLOW_STEPS = [
  { mode: "Fast", idea: "What is MALIK AI in one sentence?", outcome: "Quick practical answer" },
  { mode: "Deep", idea: "Analyze a Kazakhstan ed-tech startup idea.", outcome: "Structured analysis" },
  { mode: "Pro", idea: "Draft investor-grade strategy outline.", outcome: "Investor pitch draft" },
  { mode: "Code", idea: "Plan a Next.js dashboard stats card.", outcome: "Code plan / snippet" },
  { mode: "Photo", idea: "Futuristic Kazakhstan AI command center visual.", outcome: "Image prompt / job" },
  { mode: "Video", idea: "30-second product launch motion concept.", outcome: "Video job / status" },
  { mode: "Capabilities", idea: "Recommend abilities for a student founder.", outcome: "Capability recommendation" },
] as const

export const LIVE_DEMO_ACTIONS = [
  { id: "fast", label: "Fast Mode", api: "/api/ai/chat", body: { mode: "fast", prompt: "What is MALIK AI in one sentence?" } },
  { id: "deep", label: "Deep Mode", api: "/api/ai/chat", body: { mode: "deep", prompt: "Analyze a Kazakhstan student startup idea in 5 bullets." } },
  { id: "pro", label: "Pro Mode", api: "/api/ai/chat", body: { mode: "pro", prompt: "Draft a short investor strategy outline for an AI command center." } },
  { id: "code", label: "Code Mode", api: "/api/ai/code", body: { prompt: "Outline a TypeScript Next.js stats card component." } },
  { id: "photo", label: "Photo Mode", api: "/api/ai/image", body: { prompt: "Futuristic Kazakhstan AI command center, cinematic, no text" } },
  { id: "video", label: "Video Mode", api: "/api/ai/video", body: { prompt: "Short AI product launch motion graphic, no logos" } },
] as const

export const TRUST_POINTS = [
  "Server-side provider calls only — no API keys in the browser bundle.",
  "Public status routes return booleans and safe metadata only.",
  "Multi-provider fallback engine when a primary model is unavailable.",
  "No fake users, investors, revenue, clients or partnership claims.",
  "Honest early-stage release candidate positioning.",
  "Legal and psychology disclaimers on sensitive capability flows.",
] as const

export const PRESS_QUOTE =
  "MALIK AI is built as a practical Kazakhstan-born command center for students, founders and media teams who need chat, code and media generation in one honest product surface."

export const MEDIA_CHECKLIST = [
  "Founder bio (short + long)",
  "Product one-paragraph description",
  "3–5 live UI screenshots",
  "60-second demo script (/demo)",
  "Public status page (/status)",
  "Logo assets (/logo.png, /icon.svg)",
  "Honest stage statement: early-stage release candidate",
] as const

export function getPublicProofStatus() {
  const env = getSafeEnvSnapshot()
  const capabilitiesLoaded = CAPABILITIES.length === EXPECTED_CAPABILITY_COUNT

  return {
    groqConfigured: env.groqConfigured,
    bedrockPrimaryConfigured: env.bedrockPrimaryConfigured,
    bedrockBackupConfigured: env.bedrockBackupConfigured,
    azureConfigured: env.azureConfigured,
    photoModelConfigured: env.photoModelConfigured,
    videoModelConfigured: env.videoModelConfigured,
    capabilitiesLoaded,
    capabilitiesCount: CAPABILITIES.length,
    buildReady: true,
    region: env.region,
    stage: STAGE_LINE,
    positioning: HONEST_POSITIONING,
    founder: FOUNDER_LINE,
    disclaimer: PROFESSIONAL_DISCLAIMER,
  }
}

export function getHonestBenchmarks() {
  const read = (name: string) => {
    const value = process.env[name]?.trim()
    return value && value.length > 0 ? value : "not measured yet"
  }

  return [
    { id: "fast-latency", label: "Fast mode latency", value: read("MALIK_BENCH_FAST_MS"), unit: "ms" },
    { id: "deep-test", label: "Deep mode test status", value: read("MALIK_BENCH_DEEP_STATUS") },
    { id: "code-test", label: "Code mode test status", value: read("MALIK_BENCH_CODE_STATUS") },
    { id: "fallback-test", label: "Fallback test status", value: read("MALIK_BENCH_FALLBACK_STATUS") },
    { id: "build", label: "Production build", value: read("MALIK_BUILD_STATUS") },
  ] as const
}

export const CONTACT_ACTIONS = [
  { id: "waitlist", label: "Join waitlist", href: `mailto:${PROOF_CONTACT_EMAIL}?subject=MALIK%20AI%20waitlist` },
  { id: "demo", label: "Request demo", href: `mailto:${PROOF_CONTACT_EMAIL}?subject=MALIK%20AI%20demo%20request` },
  { id: "founder", label: "Contact founder", href: `mailto:${PROOF_CONTACT_EMAIL}?subject=Founder%20contact%20%E2%80%94%20MALIK%20AI` },
  { id: "bug", label: "Report bug", href: `mailto:${PROOF_CONTACT_EMAIL}?subject=MALIK%20AI%20bug%20report` },
] as const
