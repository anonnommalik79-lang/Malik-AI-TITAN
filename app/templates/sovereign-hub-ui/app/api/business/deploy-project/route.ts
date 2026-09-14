import { createHash } from "node:crypto"
import { NextResponse } from "next/server"
import { resolveRequestEntitlement } from "@/lib/server/request-entitlement"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type ProjectFile = { path?: string; content?: string }
type DeployBody = { name?: string; files?: ProjectFile[] }

function safeName(value?: string) {
  const base = String(value || "malik-company")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 42)
  return `${base || "malik-company"}-${Date.now().toString(36)}`
}

function safePath(value?: string) {
  const path = String(value || "").replace(/\\/g, "/").replace(/^\/+/, "")
  if (!path || path.includes("..") || path.startsWith(".")) return ""
  return path
}

function apiUrl(path: string) {
  const teamId = String(process.env.VERCEL_TEAM_ID || "").trim()
  if (!teamId) return `https://api.vercel.com${path}`
  return `https://api.vercel.com${path}${path.includes("?") ? "&" : "?"}teamId=${encodeURIComponent(teamId)}`
}

async function jsonError(response: Response) {
  const data = await response.json().catch(() => null)
  const message = data?.error?.message || data?.message || response.statusText
  return String(message || `Vercel HTTP ${response.status}`).slice(0, 700)
}

async function uploadFile(token: string, path: string, content: string) {
  const bytes = Buffer.from(content, "utf8")
  const sha = createHash("sha1").update(bytes).digest("hex")
  const response = await fetch(apiUrl("/v2/files"), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/octet-stream",
      "x-vercel-digest": sha,
    },
    body: bytes,
    cache: "no-store",
  })
  if (!response.ok) throw new Error(`${path}: ${await jsonError(response)}`)
  return { file: path, sha, size: bytes.length }
}

async function waitForBuild(token: string, deploymentId: string) {
  let latest: any = null
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const response = await fetch(apiUrl(`/v13/deployments/${encodeURIComponent(deploymentId)}`), {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    })
    if (response.ok) {
      latest = await response.json().catch(() => null)
      const state = String(latest?.readyState || latest?.status || "").toUpperCase()
      if (["READY", "ERROR", "CANCELED", "CANCELLED"].includes(state)) return latest
    }
    await new Promise((resolve) => setTimeout(resolve, 1800))
  }
  return latest
}

export async function POST(request: Request) {
  try {
    const entitlement = await resolveRequestEntitlement(request)
    if (entitlement.plan !== "owner") {
      return NextResponse.json({ ok: false, code: "OWNER_ONLY", error: "Project deploy is currently limited to the Malik AI owner account." }, { status: 403 })
    }

    const token = String(process.env.VERCEL_TOKEN || "").trim()
    if (!token) {
      return NextResponse.json({
        ok: false,
        code: "VERCEL_NOT_CONFIGURED",
        error: "VERCEL_TOKEN is not configured on the server.",
        dropUrl: "https://vercel.com/drop",
      }, { status: 503 })
    }

    const body = (await request.json()) as DeployBody
    const incoming = Array.isArray(body?.files) ? body.files : []
    const files = incoming
      .map((file) => ({ path: safePath(file?.path), content: String(file?.content || "") }))
      .filter((file) => file.path && file.content)

    if (!files.length) return NextResponse.json({ ok: false, code: "NO_FILES", error: "Project files are required." }, { status: 400 })
    if (files.length > 80) return NextResponse.json({ ok: false, code: "TOO_MANY_FILES", error: "Project contains too many files." }, { status: 413 })

    const totalBytes = files.reduce((sum, file) => sum + Buffer.byteLength(file.content, "utf8"), 0)
    if (totalBytes > 2_500_000) return NextResponse.json({ ok: false, code: "PROJECT_TOO_LARGE", error: "Project is too large to deploy." }, { status: 413 })

    const required = new Set(["package.json", "app/page.tsx", "app/layout.tsx", "app/globals.css"])
    for (const path of required) {
      if (!files.some((file) => file.path === path)) {
        return NextResponse.json({ ok: false, code: "INVALID_PROJECT", error: `Missing ${path}` }, { status: 400 })
      }
    }

    const uploaded = [] as Array<{ file: string; sha: string; size: number }>
    for (const file of files) uploaded.push(await uploadFile(token, file.path, file.content))

    const deployment = await fetch(apiUrl("/v13/deployments"), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: safeName(body?.name),
        files: uploaded,
        projectSettings: { framework: "nextjs" },
      }),
      cache: "no-store",
    })

    if (!deployment.ok) {
      return NextResponse.json({ ok: false, code: "VERCEL_DEPLOY_FAILED", error: await jsonError(deployment) }, { status: 502 })
    }

    const created = await deployment.json().catch(() => ({}))
    const deploymentId = String(created?.id || created?.uid || "")
    const built = deploymentId ? await waitForBuild(token, deploymentId) : null
    const finalData = built || created
    const host = String(finalData?.url || created?.url || "").replace(/^https?:\/\//, "")
    const readyState = String(finalData?.readyState || finalData?.status || created?.readyState || "QUEUED").toUpperCase()

    if (!host) return NextResponse.json({ ok: false, code: "VERCEL_URL_MISSING", error: "Vercel created a deployment without a public URL." }, { status: 502 })

    if (["ERROR", "CANCELED", "CANCELLED"].includes(readyState)) {
      const errorMessage = String(finalData?.errorMessage || finalData?.errorCode || "Vercel build failed")
      return NextResponse.json({
        ok: false,
        code: "VERCEL_BUILD_FAILED",
        error: errorMessage,
        id: deploymentId,
        url: `https://${host}`,
        readyState,
        inspectorUrl: finalData?.inspectorUrl || created?.inspectorUrl || null,
      }, { status: 502 })
    }

    return NextResponse.json({
      ok: true,
      id: deploymentId,
      url: `https://${host}`,
      readyState,
      buildVerified: readyState === "READY",
      inspectorUrl: finalData?.inspectorUrl || created?.inspectorUrl || null,
    })
  } catch (error) {
    return NextResponse.json({ ok: false, code: "PROJECT_DEPLOY_FAILED", error: error instanceof Error ? error.message : "Project deployment failed" }, { status: 500 })
  }
}
