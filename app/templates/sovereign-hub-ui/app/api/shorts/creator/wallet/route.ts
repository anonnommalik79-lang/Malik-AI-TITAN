import { NextRequest, NextResponse } from "next/server"
import { getOptionalWorkOSAuth } from "@/lib/auth/server"
import { clampInt, getShortsSupabaseConfig, shortsSupabaseRequest } from "@/lib/shorts/server"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const { user } = await getOptionalWorkOSAuth()
  if (!user) return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 })
  if (!getShortsSupabaseConfig()) return NextResponse.json({ wallet: null, ledger: [], persistence: false })
  const limit = clampInt(request.nextUrl.searchParams.get("limit"), 1, 200, 50)
  const encoded = encodeURIComponent(user.id)
  const [wallets, ledger, memberships] = await Promise.all([
    shortsSupabaseRequest<any[]>(`malik_shorts_creator_wallets?select=*&user_key=eq.${encoded}&limit=1`).catch(() => []),
    shortsSupabaseRequest<any[]>(`malik_shorts_creator_ledger?select=id,entry_type,amount_credits,post_id,reference_key,metadata,created_at&user_key=eq.${encoded}&order=created_at.desc&limit=${limit}`).catch(() => []),
    shortsSupabaseRequest<any[]>(`malik_shorts_memberships?select=member_key,tier,status,started_at,expires_at&creator_key=eq.${encoded}&status=eq.active&limit=5000`).catch(() => []),
  ])
  const wallet = wallets[0] || { user_key: user.id, available_credits: 0, pending_credits: 0, lifetime_earned_credits: 0 }
  return NextResponse.json({ wallet, ledger, activeMembers: memberships.length, persistence: true }, { headers: { "Cache-Control": "private, no-store" } })
}
