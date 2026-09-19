import "server-only"

import { readFileSync } from "node:fs"
import path from "node:path"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Variant = "desktop" | "mobile"
type TeaserCache = Partial<Record<Variant, Buffer>>

const PARTS: Record<Variant, string[]> = {
  desktop: ["desktop.b64.part1", "desktop.b64.part2", "desktop.b64.part3"],
  mobile: ["mobile.b64.part1", "mobile.b64.part2", "mobile.b64.part3"],
}

const ETAGS: Record<Variant, string> = {
  desktop: '"b0923c7e3dad1c20f9710b0137206fee36091c96c0832e7ab83696bd6a3cb76b"',
  mobile: '"34e8112144b53305ecf5265aba9ffadd77750e4f530b0b60452194c4ce8203ac"',
}

function cache() {
  const scope = globalThis as typeof globalThis & { __malikVoltframeTeaser?: TeaserCache }
  if (!scope.__malikVoltframeTeaser) scope.__malikVoltframeTeaser = {}
  return scope.__malikVoltframeTeaser
}

function readVariant(variant: Variant) {
  const cached = cache()[variant]
  if (cached) return cached

  const directory = path.join(process.cwd(), "assets", "voltframe-teaser")
  const base64 = PARTS[variant]
    .map((part) => readFileSync(path.join(directory, part), "utf8"))
    .join("")
    .replace(/\s+/g, "")

  const bytes = Buffer.from(base64, "base64")
  cache()[variant] = bytes
  return bytes
}

export async function GET(request: Request, context: { params: Promise<{ variant: string }> }) {
  const { variant: rawVariant } = await context.params
  const variant: Variant | null = rawVariant === "desktop" || rawVariant === "mobile" ? rawVariant : null

  if (!variant) {
    return Response.json({ ok: false, error: "TEASER_VARIANT_NOT_FOUND" }, { status: 404 })
  }

  if (request.headers.get("if-none-match") === ETAGS[variant]) {
    return new Response(null, {
      status: 304,
      headers: {
        ETag: ETAGS[variant],
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    })
  }

  const bytes = readVariant(variant)
  return new Response(bytes, {
    status: 200,
    headers: {
      "Content-Type": "image/webp",
      "Content-Length": String(bytes.byteLength),
      "Cache-Control": "public, max-age=31536000, immutable",
      ETag: ETAGS[variant],
      "X-Content-Type-Options": "nosniff",
    },
  })
}
