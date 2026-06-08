import { getPublicCapabilities } from "@/lib/ai/capabilities"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  return Response.json(getPublicCapabilities(), {
    headers: {
      "Cache-Control": "no-store",
    },
  })
}
