export const runtime = "nodejs"

export async function POST(request: Request) {
  const target = new URL("/api/auth/logout", request.url)
  const response = await fetch(target, {
    method: "POST",
    headers: request.headers,
    signal: request.signal,
  })
  const data = await response.json().catch(() => ({ ok: true, signedOut: true }))
  return Response.json(data, { status: response.status })
}
