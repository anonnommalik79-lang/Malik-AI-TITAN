import {
  estimateUberRide,
  isSameMalikOrigin,
  publicUberError,
  type UberRideDestination,
} from "@/lib/server/uber-rides"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  if (!isSameMalikOrigin(request)) {
    return Response.json({ ok: false, code: "INVALID_ORIGIN", message: "Invalid request origin." }, { status: 403 })
  }

  try {
    const body = await request.json().catch(() => null)
    const start = body?.start || {}
    const destination = body?.destination as UberRideDestination
    const options = await estimateUberRide(start, destination)
    return Response.json({ ok: true, options }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    const failure = publicUberError(error)
    return Response.json({ ok: false, ...failure }, { status: failure.status, headers: { "Cache-Control": "no-store" } })
  }
}
