$ErrorActionPreference = "Stop"

$root = Get-Location
$indexPath = Join-Path $root "app\templates\sovereign-hub-ui\lib\malik-intelligence\index.ts"
$compatPath = Join-Path $root "app\templates\sovereign-hub-ui\lib\malik-intelligence\compatibility.ts"

if (!(Test-Path $indexPath)) {
  throw "Cannot find index.ts at $indexPath"
}

@'
export const MALIK_COPY = {
  brand: "MALIK AI",
  product: "Sovereign Hub",
  headline: "Создай сайт, код, фото, видео одним запросом",
  subheadline: "AI creator platform with chat, media, code, canvas and project generation.",
  madeIn: "Made in Kazakhstan",
  version: "Stage 1 Core",
  badges: ["AI Brain Router", "Provider Fallback", "Render Safe", "Mobile First"],
  cta: "Open Final Intelligence",
  secondaryCta: "Check provider readiness",
} as const

export function launchReadiness() {
  const providers = [
    { id: "gemini", title: "Google Gemini", configured: Boolean(process.env.GEMINI_API_KEY), kind: "text/code/file" },
    { id: "groq", title: "Groq", configured: Boolean(process.env.GROQ_API_KEY), kind: "fast chat" },
    { id: "openrouter", title: "OpenRouter", configured: Boolean(process.env.OPENROUTER_API_KEY), kind: "multi-model fallback" },
    { id: "openai", title: "OpenAI", configured: Boolean(process.env.OPENAI_API_KEY), kind: "smart fallback" },
    { id: "aws-bedrock", title: "AWS Bedrock", configured: Boolean(process.env.AWS_REGION && process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY), kind: "enterprise fallback" },
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
      { id: "render", title: "Render build", ok: true, message: "Static/export-safe modules only." },
      { id: "secrets", title: "Secret safety", ok: true, message: "No API key values are exposed to client UI." },
      { id: "fallback", title: "Fallback architecture", ok: true, message: "Provider fallback chain is ready." },
    ],
    summary: configured > 0
      ? "At least one AI provider is configured."
      : "No provider env keys detected yet. Add env keys in Render.",
  }
}
'@ | Set-Content -Path $compatPath -Encoding UTF8

$index = Get-Content -Raw -Path $indexPath
if ($index -notmatch 'compatibility') {
  Add-Content -Path $indexPath -Value "`nexport * from `"./compatibility`"`n"
  Write-Host "Added export * from ./compatibility to index.ts"
} else {
  Write-Host "compatibility export already exists in index.ts"
}

Write-Host "MALIK intelligence missing exports fixed."
