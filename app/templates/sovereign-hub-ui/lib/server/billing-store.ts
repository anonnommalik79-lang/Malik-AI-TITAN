import type { AIPlan } from "@/lib/ai/types"
import { createSupabaseAdminClient } from "@/lib/server/supabase-admin"
import {
  approveBillingOrder,
  createBillingOrder,
  getBillingOrder,
  getRuntimePlan,
  grantRuntimePlan,
  type BillingOrder,
} from "@/lib/server/runtime-store"

function normalizeOrder(row: any): BillingOrder {
  return {
    id: String(row.id),
    email: String(row.email || "").toLowerCase(),
    plan: row.plan,
    status: row.status,
    createdAt: String(row.created_at || row.createdAt || new Date().toISOString()),
    approvedAt: row.approved_at ? String(row.approved_at) : undefined,
  }
}

function looksLikeUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

async function profileIdForEmail(email: string) {
  const client = createSupabaseAdminClient()
  if (!client) return ""
  const { data } = await client.from("profiles").select("id").eq("email", email).maybeSingle()
  return String(data?.id || "")
}

export async function createPendingOrder(email: string, plan: BillingOrder["plan"]) {
  const client = createSupabaseAdminClient()
  if (!client) return { order: createBillingOrder(email, plan), storage: "memory-fallback" as const }
  const { data, error } = await client
    .from("billing_orders")
    .insert({ email, plan, status: "pending" })
    .select("id,email,plan,status,created_at,approved_at")
    .single()
  if (error || !data) return { order: createBillingOrder(email, plan), storage: "memory-fallback" as const }
  return { order: normalizeOrder(data), storage: "persistent-ready" as const }
}

export async function findOrder(id: string) {
  const client = createSupabaseAdminClient()
  if (client && looksLikeUuid(id)) {
    const { data } = await client
      .from("billing_orders")
      .select("id,email,plan,status,created_at,approved_at")
      .eq("id", id)
      .maybeSingle()
    if (data) return normalizeOrder(data)
  }
  return getBillingOrder(id)
}

export async function grantPlan(email: string, plan: AIPlan, adminEmail = "system") {
  const normalizedEmail = email.trim().toLowerCase()
  grantRuntimePlan(normalizedEmail, plan)
  const client = createSupabaseAdminClient()
  if (!client) return { storage: "memory-fallback" as const }
  const userId = await profileIdForEmail(normalizedEmail)
  if (!userId) return { storage: "memory-fallback" as const }
  const { error } = await client.from("subscriptions").upsert({ user_id: userId, plan, status: "active", source: "manual", updated_at: new Date().toISOString() })
  if (error) return { storage: "memory-fallback" as const }
  await client.from("profiles").update({ plan, updated_at: new Date().toISOString() }).eq("id", userId)
  await client.from("admin_actions").insert({ admin_email: adminEmail, action: "grant_plan", target: `${normalizedEmail}:${plan}` })
  return { storage: "persistent-ready" as const }
}

export async function approveOrder(id: string, adminEmail = "system") {
  const client = createSupabaseAdminClient()
  if (client && looksLikeUuid(id)) {
    const approvedAt = new Date().toISOString()
    const { data } = await client
      .from("billing_orders")
      .update({ status: "approved", approved_at: approvedAt })
      .eq("id", id)
      .select("id,email,plan,status,created_at,approved_at")
      .maybeSingle()
    if (data) {
      const order = normalizeOrder(data)
      await grantPlan(order.email, order.plan, adminEmail)
      return order
    }
  }
  const order = approveBillingOrder(id)
  if (order) await grantPlan(order.email, order.plan, adminEmail)
  return order
}

export async function entitledPlan(email: string): Promise<AIPlan> {
  const normalizedEmail = email.trim().toLowerCase()
  const client = createSupabaseAdminClient()
  if (client) {
    const userId = await profileIdForEmail(normalizedEmail)
    if (userId) {
      const { data } = await client.from("subscriptions").select("plan,status").eq("user_id", userId).maybeSingle()
      if (data?.status === "active" && ["pro", "ultra", "owner"].includes(String(data.plan))) return data.plan as AIPlan
    }
  }
  return getRuntimePlan(normalizedEmail)
}
