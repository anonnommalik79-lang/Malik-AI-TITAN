const SOURCES: Record<string, string> = {
  mistral: "https://mistral.ai/favicon.ico",
  minimax: "https://www.minimax.io/favicon.ico",
  qwen: "https://qwen.ai/favicon.ico",
  sensenova: "https://www.sensetime.com/favicon.ico",
  deepseek: "https://www.deepseek.com/favicon.ico",
  zai: "https://chat.z.ai/favicon.ico",
  anthropic: "https://www.anthropic.com/favicon.ico",
  google: "https://ai.google.dev/favicon.ico",
  openai: "https://openai.com/favicon.ico",
  xai: "https://x.ai/favicon.ico",
  kimi: "https://www.kimi.com/favicon.ico",
  meta: "https://www.meta.com/favicon.ico",
  xiaomi: "https://www.mi.com/favicon.ico",
  kling: "https://klingai.com/favicon.ico",
  bytedance: "https://www.bytedance.com/favicon.ico",
  nvidia: "https://www.nvidia.com/favicon.ico",
  nara: "https://router.bynara.id/favicon.ico",
  baidu: "https://www.baidu.com/favicon.ico",
  xkiro: "https://xkiro.com/favicon.ico",
  llm7: "https://llm7.io/favicon.ico",
}

function fallbackSvg(label: string) {
  const safe = (label || "AI").replace(/[^a-z0-9]/gi, "").slice(0, 2).toUpperCase() || "AI"
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#fff"/><text x="32" y="39" text-anchor="middle" font-family="Arial,sans-serif" font-size="22" font-weight="800" fill="#050505">${safe}</text></svg>`
}

export async function GET(_request: Request, context: { params: Promise<{ brand: string }> }) {
  const { brand } = await context.params
  const key = String(brand || "").trim().toLowerCase()
  const source = SOURCES[key]
  if (!source) {
    return new Response(fallbackSvg(key), {
      status: 200,
      headers: { "content-type": "image/svg+xml; charset=utf-8", "cache-control": "public, max-age=86400, stale-while-revalidate=604800" },
    })
  }

  try {
    const response = await fetch(source, {
      headers: { "user-agent": "MalikAI-BrandIconProxy/1.0", accept: "image/*" },
      signal: AbortSignal.timeout(6_000),
      next: { revalidate: 86400 },
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const contentType = response.headers.get("content-type") || "image/x-icon"
    if (!contentType.startsWith("image/")) throw new Error("Not an image")
    const bytes = await response.arrayBuffer()
    if (!bytes.byteLength || bytes.byteLength > 512_000) throw new Error("Invalid icon size")
    return new Response(bytes, {
      status: 200,
      headers: { "content-type": contentType, "cache-control": "public, max-age=86400, stale-while-revalidate=604800" },
    })
  } catch {
    return new Response(fallbackSvg(key), {
      status: 200,
      headers: { "content-type": "image/svg+xml; charset=utf-8", "cache-control": "public, max-age=3600, stale-while-revalidate=86400" },
    })
  }
}
