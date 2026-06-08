import { getRuntimeHistory } from "@/lib/server/runtime-store"

export async function GET(request: Request) {
  const userId = new URL(request.url).searchParams.get("userId") || "guest"
  return Response.json({ ok: true, history: getRuntimeHistory(userId), mode: "memory-fallback" })
}
