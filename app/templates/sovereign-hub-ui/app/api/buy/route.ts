import { NextResponse } from "next/server"

export const runtime = "nodejs"

export async function GET(request: Request) {
  const url = new URL(request.url)
  const plan = url.searchParams.get("plan") || "pro"
  const checkout = new URL("/api/billing/checkout", request.url)
  checkout.searchParams.set("plan", plan)
  return NextResponse.redirect(checkout)
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const target = new URL("/api/billing/checkout", request.url)
  const response = await fetch(target, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: request.signal,
  })
  const data = await response.json().catch(() => ({}))
  return Response.json(data, { status: response.status })
}
