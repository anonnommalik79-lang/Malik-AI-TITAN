import {
  cancelUberRide,
  getUberRide,
  isSameMalikOrigin,
  publicUberError,
  requestUberRide,
} from "@/lib/server/uber-rides"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  if (!isSameMalikOrigin(request)) {
    return Response.json({ ok: false, code: "INVALID_ORIGIN", message: "Invalid request origin." }, { status: 403 })
  }

  try {
    const body = await request.json().catch(() => null)
    if (body?.confirm !== true) {
      return Response.json({ ok: false, code: "CONFIRMATION_REQUIRED", message: "Подтверди заказ кнопкой с актуальной ценой." }, { status: 400 })
    }
    const ride = await requestUberRide(String(body?.quoteToken || ""))
    return Response.json({ ok: true, ride }, { status: 202, headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    const failure = publicUberError(error)
    return Response.json({ ok: false, ...failure }, { status: failure.status, headers: { "Cache-Control": "no-store" } })
  }
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const ride = await getUberRide(String(url.searchParams.get("id") || ""))
    return Response.json({ ok: true, ride }, { headers: { "Cache-Control": "no-store" } })
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
    const url = new URL(request.url)
    const result = await cancelUberRide(String(url.searchParams.get("id") || ""))
    return Response.json({ ok: true, ...result })
  } catch (error) {
    const failure = publicUberError(error)
    return Response.json({ ok: false, ...failure }, { status: failure.status })
  }
}
