import { createHash } from "node:crypto"

import type { AIPlan } from "@/lib/ai/types"
import {
  createBillingOrder,
  getBillingOrder,
  getRuntimePlan,
  grantRuntimePlan,
  type BillingOrder,
} from "@/lib/server/runtime-store"
import { privateJsonStoreConfigured, readPrivateJson, writePrivateJson } from "@/lib/server/private-json-store"

type StoredPlanGrant = {
  email: string
  plan: AIPlan
  updatedAt: string
  updatedBy: string
}

function normalizedEmail(value: string) {
  return String(value || "").trim().toLowerCase()
}

function emailHash(email: string) {
  return createHash("sha256").update(normalizedEmail(email)).digest("hex")
}

function orderKey(id: string) {
  return `private/system/malik-billing/orders/${String(id || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 160)}.json`
}

function planKey(email: string) {
  return `private/system/malik-billing/plans/${emailHash(email)}.json`
}

async function persistOrder(order: BillingOrder) {
  const stored = await writePrivateJson(orderKey(order.id), order)
  return stored ? "object-storage" as const : "runtime" as const
}

export async function createPendingOrder(email: string, plan: BillingOrder["plan"]) {
  const order = createBillingOrder(normalizedEmail(email), plan)
  const storage = await persistOrder(order)
  return { order, storage }
}

export async function findOrder(id: string) {
  const safeId = String(id || "").trim()
  if (!safeId) return null
  const runtime = getBillingOrder(safeId)
  if (runtime) return runtime
  return readPrivateJson<BillingOrder>(orderKey(safeId))
}

export async function grantPlan(email: string, plan: AIPlan, adminEmail = "system") {
  const normalized = normalizedEmail(email)
  grantRuntimePlan(normalized, plan)
  const stored = await writePrivateJson(planKey(normalized), {
    email: normalized,
    plan,
    updatedAt: new Date().toISOString(),
    updatedBy: normalizedEmail(adminEmail) || "system",
  } satisfies StoredPlanGrant)
  return { storage: stored ? "object-storage" as const : "runtime" as const }
}

export async function approveOrder(id: string, adminEmail = "system") {
  const order = await findOrder(id)
  if (!order) return null
  const approved: BillingOrder = {
    ...order,
    status: "approved",
    approvedAt: order.approvedAt || new Date().toISOString(),
  }
  await Promise.all([
    persistOrder(approved),
    grantPlan(approved.email, approved.plan, adminEmail),
  ])
  return approved
}

export async function entitledPlan(email: string): Promise<AIPlan> {
  const normalized = normalizedEmail(email)
  if (privateJsonStoreConfigured()) {
    const persisted = await readPrivateJson<StoredPlanGrant>(planKey(normalized))
    if (persisted?.email === normalized && ["free", "pro", "ultra", "owner"].includes(persisted.plan)) {
      grantRuntimePlan(normalized, persisted.plan)
      return persisted.plan
    }
  }
  return getRuntimePlan(normalized)
}
