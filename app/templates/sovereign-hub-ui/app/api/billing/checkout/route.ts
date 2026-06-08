import { createPendingOrder } from "@/lib/server/billing-store"

const DEFAULT_WALLET = "TAdNa6wGagQDgoZituHUNEb7uxPgRAijno"

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const email = String(body?.email || body?.username || "").trim().toLowerCase()
  const plan = String(body?.plan || "").trim().toLowerCase()
  if (!email.includes("@")) return Response.json({ ok: false, error: "email_required" }, { status: 400 })
  if (plan !== "pro" && plan !== "ultra") return Response.json({ ok: false, error: "paid_plan_required" }, { status: 400 })
  const { order, storage } = await createPendingOrder(email, plan)
  const wallet = (process.env.MALIK_PAYMENT_WALLET_ADDRESS || DEFAULT_WALLET).trim()
  const telegram = (process.env.MALIK_TELEGRAM_USERNAME || "").trim().replace(/^@/, "")
  const text = `MALIK AI ${plan.toUpperCase()} plan request. Order: ${order.id}. Account: ${email}. Wallet: ${wallet}`
  return Response.json({
    ok: true,
    order,
    mode: "manual-pending",
    storage,
    wallet,
    checkoutUrl: telegram ? `https://t.me/${telegram}?text=${encodeURIComponent(text)}` : undefined,
    message: "Order created. Activation happens only after verified payment or admin approval.",
  })
}
