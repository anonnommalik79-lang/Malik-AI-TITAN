import { resolveRequestEntitlement } from "@/lib/server/request-entitlement"
import { getWorkQuota, WorkQuotaError } from "@/lib/server/work-quota"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    const entitlement = await resolveRequestEntitlement(request)
    const quota = await getWorkQuota(entitlement)
    return Response.json({ ok: true, quota }, { headers: { "cache-control": "private, no-store" } })
  } catch (error) {
    const failure = error instanceof WorkQuotaError ? error : new WorkQuotaError()
    return Response.json({ ok: false, code: failure.code, message: failure.message }, {
      status: failure.status,
      headers: { "cache-control": "private, no-store" },
    })
  }
}
