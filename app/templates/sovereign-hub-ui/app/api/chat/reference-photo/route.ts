import { verifyReferencePhotoTicket } from "@/lib/media/reference-photo-ticket"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const url = new URL(request.url)
  const target = verifyReferencePhotoTicket(url.pathname + url.search)
  if (!target) return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } })
  return new Response(null, { status: 307, headers: {
    Location: target, "Cache-Control": "private, max-age=3600", "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  } })
}
