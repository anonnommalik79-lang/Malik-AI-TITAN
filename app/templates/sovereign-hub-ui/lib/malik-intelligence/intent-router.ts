import type { IntelligenceIntent, IntelligenceKind } from "./types"
import { collectSignals, signalScore, SIGNALS } from "./intent-signals"
import { detectLanguageFromPrompt } from "./language-codex"

function clampConfidence(score: number) {
  return Math.max(0.35, Math.min(0.98, score))
}

function aspect(prompt: string): "1:1" | "16:9" | "9:16" {
  if (/9:16|reels|tiktok|сторис|shorts/i.test(prompt)) return "9:16"
  if (/1:1|avatar|аватар|square|квадрат/i.test(prompt)) return "1:1"
  return "16:9"
}

function duration(prompt: string): 5 | 8 | 12 {
  if (/12s|12 сек|12 секунд/i.test(prompt)) return 12
  if (/8s|8 сек|8 секунд/i.test(prompt)) return 8
  return 5
}

export function routeIntelligenceIntent(promptRaw: string): IntelligenceIntent {
  const prompt = String(promptRaw || "").trim()
  const scored = (Object.keys(SIGNALS) as IntelligenceKind[])
    .filter((kind) => kind in SIGNALS)
    .map((kind) => {
      const signals = collectSignals(prompt, kind as keyof typeof SIGNALS)
      return { kind, signals, score: signalScore(signals) }
    })
    .sort((a, b) => b.score - a.score)

  const top = scored[0]
  const language = detectLanguageFromPrompt(prompt)

  if (!prompt) {
    return {
      kind: "chat",
      prompt,
      confidence: 0.35,
      providerGroup: "text",
      signals: [],
      shouldOpenCanvas: false,
      shouldSaveHistory: false,
    }
  }

  const kind = top?.score > 0.26 ? top.kind : "chat"
  const providerGroup =
    kind === "image" || kind === "video" ? "media" :
    kind === "code" || kind === "website" || kind === "app" ? "code" :
    kind === "agent" ? "workflow" : "text"

  return {
    kind,
    prompt,
    confidence: clampConfidence(0.5 + (top?.score || 0)),
    providerGroup,
    signals: top?.signals || [],
    language: language.id,
    framework: /next|nextjs/i.test(prompt) ? "nextjs" : /react|tsx/i.test(prompt) ? "react" : undefined,
    aspectRatio: kind === "image" || kind === "video" ? aspect(prompt) : undefined,
    duration: kind === "video" ? duration(prompt) : undefined,
    shouldOpenCanvas: ["code", "website", "app", "document", "presentation"].includes(kind),
    shouldSaveHistory: kind !== "chat",
  }
}

