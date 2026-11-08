import "server-only"

import { directMediaUrl } from "@/lib/os/media-reference"

// Where providers publish finished videos. A saved job's URL is followed only
// to these hosts (each redirect hop included), so it can never become a way
// to reach private addresses through Malik.
const VIDEO_SOURCE_HOSTS = [
  "magichour.ai", "pixazo.ai", "aiapi-pro.com", "cliptaps.com",
  "runwayml.com", "runwayml.cloud", "amazonaws.com", "cloudfront.net",
  "r2.dev", "r2.cloudflarestorage.com", "storage.googleapis.com", "googleapis.com", "googleusercontent.com",
  "aliyuncs.com", "fal.media", "fal.ai", "fal.run", "lumalabs.ai", "pollo.ai",
  "hf.space", "huggingface.co", "hf.co",
  "bigmodel.cn", "zhipuai.cn", "replicate.delivery", "replicate.com",
  "klingai.com", "kuaishou.com", "ksyun.com", "volces.com", "byteimg.com", "bytedance.com",
  "minimax.io", "minimaxi.com", "hailuoai.com", "pika.art", "pixverse.ai", "vidu.com", "vidu.studio",
  "blob.core.windows.net", "digitaloceanspaces.com", "b-cdn.net", "backblazeb2.com",
]

export function allowedVideoSource(raw: string): URL | null {
  const direct = directMediaUrl(raw, process.env.NEXT_PUBLIC_APP_URL || process.env.MALIK_PUBLIC_ORIGIN || "")
  if (!direct) return null
  try {
    const url = new URL(direct)
    const configured = (process.env.MALIK_VIDEO_BRANDING_ALLOWED_HOSTS || "")
      .split(",").map((host) => host.trim().toLowerCase()).filter(Boolean)
    const names = [...VIDEO_SOURCE_HOSTS, ...configured]
    return names.some((domain) => url.hostname === domain || url.hostname.endsWith(`.${domain}`)) ? url : null
  } catch {
    return null
  }
}

/** GET a provider video, validating every redirect hop. */
export async function fetchVideoSource(raw: string, options: { range?: string; timeoutMs?: number } = {}): Promise<{ response: Response } | { error: string; status: number }> {
  let remote = allowedVideoSource(raw)
  if (!remote) return { error: "VIDEO_SOURCE_UNSUPPORTED", status: 422 }
  // ClipTaps can return an owner-private /uploads/ URL even when a render
  // is complete. Browser <video> requests cannot carry its account API key.
  // Authenticate only this exact ClipTaps media host + path, and re-create
  // headers on every redirect so credentials NEVER reach another host.
  const clipTapsKey = String(process.env.CLIPTAPS_API_KEY || "").trim()
  for (let redirects = 0; redirects < 5; redirects++) {
    const headers = new Headers({ Accept: "video/mp4,video/webm,video/*;q=0.9,*/*;q=0.5" })
    if (options.range) headers.set("Range", options.range)
    if (clipTapsKey && remote.hostname === "cliptaps.com" && remote.pathname.startsWith("/uploads/")) {
      headers.set("Authorization", `Bearer ${clipTapsKey}`)
    }
    const response: Response = await fetch(remote.toString(), {
      method: "GET", headers, redirect: "manual", cache: "no-store",
      signal: AbortSignal.timeout(options.timeoutMs ?? 90_000),
    })
    if (![301, 302, 303, 307, 308].includes(response.status)) return { response }
    await response.body?.cancel().catch(() => {})
    const next: string | null = response.headers.get("location")
    remote = next ? allowedVideoSource(new URL(next, remote).toString()) : null
    if (!remote) return { error: "VIDEO_REDIRECT_BLOCKED", status: 502 }
  }
  return { error: "VIDEO_TOO_MANY_REDIRECTS", status: 502 }
}
