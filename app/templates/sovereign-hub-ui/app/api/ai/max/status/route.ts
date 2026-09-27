import { maxLaneStatus, probeMaxLanes } from "@/lib/server/malik-max-engine"
import { resolveRequestEntitlement } from "@/lib/server/request-entitlement"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

/**
 * What MalikLLM MAX is made of, for the owner.
 *
 * GET  → every lane (provider · model · key), its power, whether it is resting
 *        and why, and how it has behaved since the server started.
 * POST → asks every lane for one word and reports which ones answer. Lanes
 *        that fail are rested, so the next chat request skips them.
 *
 * No key is ever returned — only its number (key 1, key 2 …).
 */

function json(payload: unknown, status = 200) {
  return Response.json(payload, { status, headers: { "cache-control": "no-store" } })
}

async function ownerOnly(request: Request) {
  const entitlement = await resolveRequestEntitlement(request)
  return entitlement.authenticated && entitlement.plan === "owner"
}

function summary(lanes: Array<{ provider: string; restingMs: number }>) {
  const byProvider: Record<string, { lanes: number; resting: number }> = {}
  for (const lane of lanes) {
    const entry = (byProvider[lane.provider] ||= { lanes: 0, resting: 0 })
    entry.lanes += 1
    if (lane.restingMs > 0) entry.resting += 1
  }
  return byProvider
}

export async function GET(request: Request) {
  if (!(await ownerOnly(request))) return json({ ok: false, error: "Только для владельца." }, 403)
  const lanes = await maxLaneStatus()
  return json({ ok: true, total: lanes.length, providers: summary(lanes), lanes })
}

export async function POST(request: Request) {
  if (!(await ownerOnly(request))) return json({ ok: false, error: "Только для владельца." }, 403)
  const results = await probeMaxLanes({ concurrency: 6 })
  const working = results.filter((item) => item.ok).length
  return json({ ok: true, working, failed: results.length - working, results })
}
