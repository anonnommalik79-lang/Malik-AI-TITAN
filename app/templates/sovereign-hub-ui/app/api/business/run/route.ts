import { runBusinessEngine } from "@/lib/server/run-business"

export const runtime = "nodejs"

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  return runBusinessEngine(request, body)
}
