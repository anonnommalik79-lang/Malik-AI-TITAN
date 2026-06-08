import type { IntelligenceResult } from "./types"
import { routeIntelligenceIntent } from "./intent-router"
import { buildMediaStoryboard, enhanceMediaPrompt } from "./media-quality-engine"
import { buildCodeArchitectPrompt, localCodeFallback } from "./code-quality-engine"
import { assembleCodeBundle } from "./code-file-assembler"
import { reviewGeneratedFiles } from "./code-reviewer"

export function planFinalResponse(prompt: string): IntelligenceResult {
  const intent = routeIntelligenceIntent(prompt)

  if (intent.kind === "image" || intent.kind === "video") {
    return {
      ok: true,
      kind: intent.kind,
      title: intent.kind === "video" ? "Video generation plan" : "Image generation plan",
      summary: enhanceMediaPrompt({
        kind: intent.kind === "video" ? "video" : "image",
        prompt,
        aspectRatio: intent.aspectRatio,
        duration: intent.duration,
      }),
      storyboard: buildMediaStoryboard({
        kind: intent.kind === "video" ? "video" : "image",
        prompt,
        aspectRatio: intent.aspectRatio,
        duration: intent.duration,
      }),
      nextActions: ["Call media backend", "Show inline generation card", "Save result to history"],
    }
  }

  if (intent.kind === "code" || intent.kind === "website" || intent.kind === "app") {
    const files = localCodeFallback(prompt, intent.language, intent.framework)
    const bundle = assembleCodeBundle(files)
    return {
      ok: true,
      kind: intent.kind,
      title: "Code generation plan",
      summary: buildCodeArchitectPrompt(prompt, intent.language, intent.framework),
      files,
      diagnostics: reviewGeneratedFiles(files),
      nextActions: [`Assembled ${bundle.totalFiles} files`, "Open in Canvas", "Run engine for full implementation"],
    }
  }

  return {
    ok: true,
    kind: intent.kind,
    title: "Malik AI answer plan",
    summary: "Route prompt to MALIK Core, keep answer concise, useful and Malik-branded.",
    nextActions: ["Answer in chat", "Offer next action"],
  }
}

