import { createHash } from "node:crypto"
import { NextResponse } from "next/server"
import { resolveRequestEntitlement } from "@/lib/server/request-entitlement"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type DeployBody = {
  html?: string
  name?: string
}

function safeName(value?: string) {
  const base = String(value || "malik-company")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 42)
  return `${base || "malik-company"}-${Date.now().toString(36)}`
}

function apiUrl(path: string) {
  const teamId = String(process.env.VERCEL_TEAM_ID || "").trim()
  if (!teamId) return `https://api.vercel.com${path}`
  return `https://api.vercel.com${path}${path.includes("?") ? "&" : "?"}teamId=${encodeURIComponent(teamId)}`
}

async function jsonError(response: Response) {
  const data = await response.json().catch(() => null)
  const message = data?.error?.message || data?.message || response.statusText
  return String(message || `Vercel HTTP ${response.status}`).slice(0, 500)
}

export async function POST(request: Request) {
  try {
    const entitlement = await resolveRequestEntitlement(request)
    if (entitlement.plan !== "owner") {
      return NextResponse.json(
        { ok: false, code: "OWNER_ONLY", error: "One-click deploy is currently limited to the Malik AI owner account." },
        { status: 403 },
      )
    }

    const token = String(process.env.VERCEL_TOKEN || "").trim()
    if (!token) {
      return NextResponse.json(
        {
          ok: false,
          code: "VERCEL_NOT_CONFIGURED",
          error: "VERCEL_TOKEN is not configured on the server.",
          dropUrl: "https://vercel.com/drop",
        },
        { status: 503 },
      )
    }

    const body = (await request.json()) as DeployBody
    const html = String(body?.html || "").trim()
    if (!html || !/<html[\s>]/i.test(html)) {
      return NextResponse.json({ ok: false, code: "INVALID_HTML", error: "A complete HTML document is required." }, { status: 400 })
    }
    if (html.length > 1_500_000) {
      return NextResponse.json({ ok: false, code: "HTML_TOO_LARGE", error: "Generated site is too large to deploy." }, { status: 413 })
    }

    const bytes = Buffer.from(html, "utf8")
    const sha = createHash("sha1").update(bytes).digest("hex")
    const headers = { Authorization: `Bearer ${token}` }

    const upload = await fetch(apiUrl("/v2/files"), {
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": "text/html; charset=utf-8",
        "x-vercel-digest": sha,
      },
      body: bytes,
      cache: "no-store",
    })

    if (!upload.ok) {
      return NextResponse.json(
        { ok: false, code: "VERCEL_UPLOAD_FAILED", error: await jsonError(upload) },
        { status: 502 },
      )
    }

    const deployment = await fetch(apiUrl("/v13/deployments"), {
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: safeName(body?.name),
        files: [{ file: "index.html", sha, size: bytes.length }],
        projectSettings: { framework: null },
      }),
      cache: "no-store",
    })

    if (!deployment.ok) {
      return NextResponse.json(
        { ok: false, code: "VERCEL_DEPLOY_FAILED", error: await jsonError(deployment) },
        { status: 502 },
      )
    }

    const data = await deployment.json().catch(() => ({}))
    const host = String(data?.url || "").replace(/^https?:\/\//, "")
    if (!host) {
      return NextResponse.json({ ok: false, code: "VERCEL_URL_MISSING", error: "Vercel created a deployment without a public URL." }, { status: 502 })
    }

    return NextResponse.json({
      ok: true,
      id: data?.id || data?.uid,
      url: `https://${host}`,
      readyState: data?.readyState || data?.status || "QUEUED",
      inspectorUrl: data?.inspectorUrl || null,
    })
  } catch (error) {
    return NextResponse.json(
      { ok: false, code: "DEPLOY_FAILED", error: error instanceof Error ? error.message : "Deployment failed" },
      { status: 500 },
    )
  }
}
