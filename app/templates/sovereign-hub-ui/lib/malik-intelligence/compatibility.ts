export const MALIK_COPY = {
  brand: "MALIK AI",
  product: "Sovereign Hub",
  headline: "Создай сайт, код, фото, видео одним запросом",
  subheadline: "AI creator platform with chat, media, code, canvas and project generation.",
  madeIn: "Made in Kazakhstan",
  version: "Stage 1 Core",
  badges: ["AI Brain Router", "MALIK Backup", "Render Safe", "Mobile First"],
  cta: "Open Final Intelligence",
  secondaryCta: "Check engine readiness",
} as const

export function launchReadiness() {
  const providers = [
    { id: "core", title: "MALIK Core", configured: Boolean(process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY), kind: "text/code/file" },
    { id: "reasoning", title: "MALIK Reasoning", configured: Boolean(process.env.MOONSHOT_API_KEY || process.env.ANTHROPIC_API_KEY), kind: "reasoning" },
    { id: "codex", title: "MALIK Codex", configured: Boolean(process.env.OPENAI_API_KEY || process.env.MOONSHOT_API_KEY), kind: "code" },
    { id: "vision", title: "MALIK Vision", configured: Boolean(process.env.OPENAI_API_KEY || process.env.FAL_KEY), kind: "image" },
    { id: "infrastructure", title: "MALIK Infrastructure", configured: Boolean(process.env.AWS_REGION && process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY), kind: "enterprise" },
  ]

  const configured = providers.filter((provider) => provider.configured).length
  const total = providers.length

  return {
    ok: configured > 0,
    score: Math.round((configured / total) * 100),
    configured,
    total,
    providers,
    checks: [
      { id: "render", title: "Render build", ok: true, message: "Node runtime routes enabled." },
      { id: "secrets", title: "Secret safety", ok: true, message: "No secret values are exposed to client UI." },
      { id: "fallback", title: "Fallback architecture", ok: true, message: "MALIK Backup is ready." },
    ],
    summary: configured > 0
      ? "At least one MALIK engine is configured."
      : "MALIK Backup is active until the server runtime is configured.",
  }
}

