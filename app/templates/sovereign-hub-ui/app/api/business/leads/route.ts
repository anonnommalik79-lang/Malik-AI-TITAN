import { z } from "zod"
import { requireMalikAdminAsync } from "@/lib/server/admin"

export const runtime = "nodejs"

const LeadSchema = z.object({
  name: z.string().trim().min(2).max(80),
  company: z.string().trim().min(2).max(120),
  contact: z.string().trim().min(3).max(160),
  niche: z.string().trim().min(1).max(120),
  website: z.string().trim().max(200).optional().default(""),
  message: z.string().trim().max(1200).optional().default(""),
  source: z.string().trim().max(80).optional().default("business-page"),
  lang: z.enum(["ru", "kk", "en"]).optional().default("ru"),
  company_site: z.string().max(0).optional().default(""),
})

type Bucket = { count: number; resetAt: number }
const buckets = new Map<string, Bucket>()
const RATE_WINDOW_MS = 10 * 60 * 1000
const RATE_LIMIT = 8

function requestIp(request: Request) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "unknown"
  )
}

function rateAllowed(key: string) {
  const now = Date.now()
  const current = buckets.get(key)
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS })
    return true
  }
  if (current.count >= RATE_LIMIT) return false
  current.count += 1
  return true
}

function supabaseConfig() {
  const url = process.env.SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  return url && key ? { url: url.replace(/\/$/, ""), key } : null
}

async function insertSupabase(row: Record<string, unknown>) {
  const config = supabaseConfig()
  if (!config) return { configured: false as const, ok: false as const }
  const response = await fetch(`${config.url}/rest/v1/business_leads`, {
    method: "POST",
    headers: {
      apikey: config.key,
      authorization: `Bearer ${config.key}`,
      "content-type": "application/json",
      prefer: "return=minimal",
    },
    body: JSON.stringify(row),
    cache: "no-store",
  })
  return { configured: true as const, ok: response.ok, status: response.status }
}

async function sendWebhook(row: Record<string, unknown>) {
  const url = process.env.BUSINESS_LEADS_WEBHOOK_URL?.trim()
  if (!url) return { configured: false as const, ok: false as const }
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(row),
      cache: "no-store",
    })
    return { configured: true as const, ok: response.ok }
  } catch {
    return { configured: true as const, ok: false as const }
  }
}

export async function POST(request: Request) {
  const raw = await request.json().catch(() => ({}))
  const parsed = LeadSchema.safeParse(raw)
  if (!parsed.success) {
    return Response.json({ ok: false, error: "invalid_lead" }, { status: 400 })
  }

  const ip = requestIp(request)
  if (!rateAllowed(ip)) {
    return Response.json({ ok: false, error: "rate_limited" }, { status: 429 })
  }

  const { company_site, ...lead } = parsed.data
  if (company_site) {
    return Response.json({ ok: true, accepted: true })
  }

  const row = {
    ...lead,
    status: "new",
    priority: "normal",
    source: lead.source || "business-page",
    user_agent: request.headers.get("user-agent")?.slice(0, 300) || null,
    created_at: new Date().toISOString(),
  }

  const stored = await insertSupabase(row)
  const webhook = stored.ok ? { configured: false, ok: true } : await sendWebhook(row)

  if (!stored.ok && !webhook.ok) {
    console.error("[malik-business] lead storage is not configured")
    return Response.json(
      { ok: false, error: stored.configured || webhook.configured ? "lead_storage_failed" : "lead_storage_not_configured" },
      { status: 503 },
    )
  }

  return Response.json({ ok: true, accepted: true, stored: stored.ok ? "supabase" : "webhook" })
}

export async function GET(request: Request) {
  const admin = await requireMalikAdminAsync(request)
  if (admin.response) return admin.response

  const config = supabaseConfig()
  if (!config) {
    return Response.json({ ok: false, error: "supabase_not_configured", leads: [] }, { status: 503 })
  }

  const url = new URL(`${config.url}/rest/v1/business_leads`)
  url.searchParams.set("select", "id,name,company,contact,niche,website,message,source,lang,status,priority,created_at,updated_at")
  url.searchParams.set("order", "created_at.desc")
  url.searchParams.set("limit", "200")

  const response = await fetch(url, {
    headers: { apikey: config.key, authorization: `Bearer ${config.key}` },
    cache: "no-store",
  })
  if (!response.ok) {
    return Response.json({ ok: false, error: "lead_query_failed", leads: [] }, { status: 502 })
  }

  const leads = await response.json().catch(() => [])
  return Response.json({ ok: true, leads })
}
