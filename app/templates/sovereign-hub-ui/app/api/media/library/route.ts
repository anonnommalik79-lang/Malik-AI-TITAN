import { NextResponse } from "next/server"
import { resolveRequestEntitlement } from "@/lib/server/request-entitlement"
import { isCloudStorageConfigured, readCloudImageHistory } from "@/lib/storage/cloud-upload"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const entitlement = await resolveRequestEntitlement(request)
  if (!entitlement.authenticated || !entitlement.userId || entitlement.userId === "guest") {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED", items: [] }, { status: 401 })
  }

  if (!isCloudStorageConfigured()) {
    return NextResponse.json({ ok: true, configured: false, items: [] })
  }

  const url = new URL(request.url)
  const requestedLimit = Number(url.searchParams.get("limit") || 200)
  const requestedOffset = Number(url.searchParams.get("offset") || 0)
  const limit = Math.max(1, Math.min(500, Number.isFinite(requestedLimit) ? Math.floor(requestedLimit) : 200))
  const offset = Math.max(0, Number.isFinite(requestedOffset) ? Math.floor(requestedOffset) : 0)

  const all = await readCloudImageHistory(entitlement.userId)
  const items = all.slice(offset, offset + limit)
  const nextOffset = offset + items.length < all.length ? offset + items.length : null

  return NextResponse.json({
    ok: true,
    configured: true,
    items,
    total: all.length,
    nextOffset,
  })
}
