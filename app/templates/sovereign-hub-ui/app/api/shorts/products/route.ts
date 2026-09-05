import { NextRequest, NextResponse } from "next/server"
import { getOptionalWorkOSAuth } from "@/lib/auth/server"
import { clampInt, getShortsSupabaseConfig, safeText, shortsSupabaseRequest } from "@/lib/shorts/server"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  if (!getShortsSupabaseConfig()) return NextResponse.json({ items: [], persistence: false })
  const sellerKey = safeText(request.nextUrl.searchParams.get("sellerKey"), 180)
  const postId = safeText(request.nextUrl.searchParams.get("postId"), 80)
  const limit = clampInt(request.nextUrl.searchParams.get("limit"), 1, 100, 30)
  if (postId && /^[0-9a-f-]{36}$/i.test(postId)) {
    const rows = await shortsSupabaseRequest<any[]>(`malik_shorts_product_tags?select=post_id,start_ms,end_ms,label,malik_shorts_products(*)&post_id=eq.${postId}&limit=${limit}`).catch(() => [])
    return NextResponse.json({ items: rows, persistence: true }, { headers: { "Cache-Control": "private, no-store" } })
  }
  const filter = sellerKey ? `&seller_key=eq.${encodeURIComponent(sellerKey)}` : ""
  const rows = await shortsSupabaseRequest<any[]>(`malik_shorts_products?select=*&status=eq.active${filter}&order=created_at.desc&limit=${limit}`).catch(() => [])
  return NextResponse.json({ items: rows, persistence: true }, { headers: { "Cache-Control": "private, no-store" } })
}

export async function POST(request: NextRequest) {
  const { user } = await getOptionalWorkOSAuth()
  if (!user) return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 })
  if (!getShortsSupabaseConfig()) return NextResponse.json({ error: "SHORTS_DB_NOT_CONFIGURED" }, { status: 503 })
  let input: { action?: string; productId?: string; postId?: string; title?: string; description?: string; currency?: string; priceMinor?: number; imageUrl?: string; destinationUrl?: string; label?: string; startMs?: number; endMs?: number }
  try { input = await request.json() } catch { return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 }) }
  const action = safeText(input.action, 30)

  try {
    if (action === "create") {
      const title = safeText(input.title, 180)
      if (!title) return NextResponse.json({ error: "TITLE_REQUIRED" }, { status: 400 })
      const rows = await shortsSupabaseRequest<any[]>("malik_shorts_products", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ seller_key: user.id, title, description: safeText(input.description, 3000), currency: safeText(input.currency, 8) || "KZT", price_minor: Number.isFinite(Number(input.priceMinor)) ? Math.max(0, Math.floor(Number(input.priceMinor))) : null, image_url: safeText(input.imageUrl, 2000) || null, destination_url: safeText(input.destinationUrl, 2000) || null, status: "active" }) })
      return NextResponse.json({ ok: true, product: rows?.[0] || null }, { status: 201 })
    }

    const productId = safeText(input.productId, 80)
    const postId = safeText(input.postId, 80)
    if (!/^[0-9a-f-]{36}$/i.test(productId) || !/^[0-9a-f-]{36}$/i.test(postId)) return NextResponse.json({ error: "INVALID_IDS" }, { status: 400 })
    const [product, post] = await Promise.all([
      shortsSupabaseRequest<any[]>(`malik_shorts_products?select=id,seller_key&seller_key=eq.${encodeURIComponent(user.id)}&id=eq.${productId}&limit=1`).catch(() => []),
      shortsSupabaseRequest<any[]>(`malik_shorts_posts?select=id,creator_key&creator_key=eq.${encodeURIComponent(user.id)}&id=eq.${postId}&limit=1`).catch(() => []),
    ])
    if (!product[0] || !post[0]) return NextResponse.json({ error: "NOT_OWNED" }, { status: 403 })

    if (action === "tag") {
      await shortsSupabaseRequest("malik_shorts_product_tags?on_conflict=post_id,product_id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ post_id: postId, product_id: productId, label: safeText(input.label, 120) || null, start_ms: Number.isFinite(Number(input.startMs)) ? Math.max(0, Math.floor(Number(input.startMs))) : null, end_ms: Number.isFinite(Number(input.endMs)) ? Math.max(0, Math.floor(Number(input.endMs))) : null }) })
      return NextResponse.json({ ok: true })
    }
    if (action === "untag") {
      await shortsSupabaseRequest(`malik_shorts_product_tags?post_id=eq.${postId}&product_id=eq.${productId}`, { method: "DELETE" })
      return NextResponse.json({ ok: true })
    }
    return NextResponse.json({ error: "INVALID_ACTION" }, { status: 400 })
  } catch (error) {
    console.error("[Malik Shorts] products failed", error)
    return NextResponse.json({ error: "PRODUCT_ACTION_FAILED" }, { status: 500 })
  }
}
