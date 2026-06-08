import type { AIPlan } from "@/lib/ai/types"

export type BillingPlan = {
  id: "free" | "pro" | "ultra"
  title: string
  priceLabel: string
  chat: number
  image: number
  video: number
  project: number
}

export type BillingOrder = {
  id: string
  email: string
  plan: BillingPlan["id"]
  status: "pending" | "approved" | "rejected"
  createdAt: string
  approvedAt?: string
}

export const BILLING_PLANS: BillingPlan[] = [
  { id: "free", title: "Free", priceLabel: "Current", chat: 15, image: 1, video: 0, project: 2 },
  { id: "pro", title: "Pro", priceLabel: "Contact", chat: 300, image: 25, video: 5, project: 30 },
  { id: "ultra", title: "Max", priceLabel: "Contact", chat: 1000, image: 100, video: 20, project: 100 },
]

const orders = new Map<string, BillingOrder>()
const grantedPlans = new Map<string, AIPlan>()
const history = new Map<string, Array<{ id: string; type: string; engine: string; status: string; createdAt: string }>>()

export function createBillingOrder(email: string, plan: BillingOrder["plan"]) {
  const order: BillingOrder = {
    id: `order_${crypto.randomUUID()}`,
    email: email.trim().toLowerCase(),
    plan,
    status: "pending",
    createdAt: new Date().toISOString(),
  }
  orders.set(order.id, order)
  return order
}

export function getBillingOrder(id: string) {
  return orders.get(id)
}

export function approveBillingOrder(id: string) {
  const order = orders.get(id)
  if (!order) return null
  const approved = { ...order, status: "approved" as const, approvedAt: new Date().toISOString() }
  orders.set(id, approved)
  grantedPlans.set(order.email, order.plan)
  return approved
}

export function grantRuntimePlan(email: string, plan: AIPlan) {
  grantedPlans.set(email.trim().toLowerCase(), plan)
}

export function getRuntimePlan(email: string) {
  return grantedPlans.get(email.trim().toLowerCase()) || "free"
}

export function runtimeStats() {
  const rows = [...orders.values()]
  return {
    mode: "memory-fallback",
    orders: rows.length,
    pendingOrders: rows.filter((item) => item.status === "pending").length,
    approvedOrders: rows.filter((item) => item.status === "approved").length,
    grantedPlans: grantedPlans.size,
  }
}

export function addRuntimeHistory(userId: string, item: { type: string; engine: string; status: string }) {
  const key = userId.trim().toLowerCase() || "guest"
  const rows = history.get(key) || []
  rows.unshift({ id: `history_${crypto.randomUUID()}`, ...item, createdAt: new Date().toISOString() })
  history.set(key, rows.slice(0, 80))
}

export function getRuntimeHistory(userId: string) {
  return history.get(userId.trim().toLowerCase() || "guest") || []
}
