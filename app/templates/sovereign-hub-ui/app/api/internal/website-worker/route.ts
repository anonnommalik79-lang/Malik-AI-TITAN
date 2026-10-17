import { timingSafeEqual } from "node:crypto"
import { pumpQueue } from "@/lib/website/engine/runner"
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export async function POST(request: Request) {
  const expected = process.env.WEBSITE_WORKER_TOKEN || ""
  const submitted = request.headers.get("authorization")?.replace(/^Bearer /, "") || ""
  if (expected.length < 32 || Buffer.byteLength(expected) !== Buffer.byteLength(submitted) || !timingSafeEqual(Buffer.from(expected), Buffer.from(submitted))) return Response.json({ ok: false }, { status: 401 })
  // Disabled by default. Browser stages refresh entitlement; unattended
  // execution is limited to a 15-minute, server-issued authorization window
  // and then pauses until the authenticated user renews it.
  if (process.env.WEBSITE_UNATTENDED_ENABLED !== "true") return Response.json({ ok: false, code: "UNATTENDED_NOT_ENABLED" }, { status: 503 })
  try {
    const job = await pumpQueue({ signal: request.signal })
    return Response.json({ ok: true, processed: Boolean(job), id: job?.id, state: job?.state }, { headers: { "Cache-Control": "no-store" } })
  } catch { return Response.json({ ok: false, code: "WORKER_STAGE_UNCONFIRMED" }, { status: 503 }) }
}
