import type { AIPlan } from "@/lib/ai/types"
import {
  approveBillingOrder,
  createBillingOrder,
  getBillingOrder,
  getRuntimePlan,
  grantRuntimePlan,
  type BillingOrder,
} from "@/lib/server/runtime-store"

export async function createPendingOrder(email: string, plan: BillingOrder["plan"]) {
  return { order: createBillingOrder(email, plan), storage: "runtime" as const }
}

export async function findOrder(id: string) {
  return getBillingOrder(id)
}

export async function grantPlan(email: string, plan: AIPlan, _adminEmail = "system") {
  grantRuntimePlan(email.trim().toLowerCase(), plan)
  return { storage: "runtime" as const }
}

export async function approveOrder(id: string, adminEmail = "system") {
  const order = approveBillingOrder(id)
  if (order) await grantPlan(order.email, order.plan, adminEmail)
  return order
}

export async function entitledPlan(email: string): Promise<AIPlan> {
  return getRuntimePlan(email.trim().toLowerCase())
}
