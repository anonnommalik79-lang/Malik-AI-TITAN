import { pingStability } from "@/lib/media/providers/stability"

export const runtime = "nodejs"

export async function GET() {
  const status = await pingStability()
  return Response.json({
    ok: true,
    provider: "stability",
    status,
    secretsExposed: false,
  })
}
