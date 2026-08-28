import {
  disconnectUber,
  getUberConnectionStatus,
  getUberSavedPlaces,
  isSameMalikOrigin,
  publicUberError,
} from "@/lib/server/uber-rides"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const status = await getUberConnectionStatus()
    const places = status.connected ? await getUberSavedPlaces() : []
    return Response.json({ ok: true, ...status, places }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    const failure = publicUberError(error)
    return Response.json({ ok: false, ...failure }, { status: failure.status, headers: { "Cache-Control": "no-store" } })
  }
}

export async function DELETE(request: Request) {
  if (!isSameMalikOrigin(request)) {
    return Response.json({ ok: false, code: "INVALID_ORIGIN", message: "Invalid request origin." }, { status: 403 })
  }
  try {
    await disconnectUber()
    return Response.json({ ok: true, connected: false })
  } catch (error) {
    const failure = publicUberError(error)
    return Response.json({ ok: false, ...failure }, { status: failure.status })
  }
}
