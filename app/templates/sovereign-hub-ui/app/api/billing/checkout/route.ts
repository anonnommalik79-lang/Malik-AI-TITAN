import { createPendingOrder } from "@/lib/server/billing-store"
import { getOptionalWorkOSAuth } from "@/lib/auth/server"

export async function POST(request: Request) {
  const { user } = await getOptionalWorkOSAuth()
  if (!user?.emailVerified) return Response.json({ ok: false, message: "Войдите в аккаунт с подтверждённой почтой." }, { status: 401 })
  const body = await request.json().catch(() => ({}))
  const email = user.email.trim().toLowerCase()
  const plan = String(body?.plan || "").trim().toLowerCase()
  if (!email.includes("@")) return Response.json({ ok: false, error: "email_required" }, { status: 400 })
  if (plan !== "pro") return Response.json({ ok: false, error: "paid_plan_required", message: "Доступен тариф MalikAI Plus." }, { status: 400 })
  const { order, storage } = await createPendingOrder(email, plan)
  const wallet = (process.env.MALIK_PAYMENT_WALLET_ADDRESS || "").trim()
  const telegram = (process.env.MALIK_TELEGRAM_USERNAME || "Sovereign_Hub").trim().replace(/^@/, "")
  const text = `Заявка на MalikAI Plus. Номер: ${order.id}. Аккаунт: ${email}.`
  return Response.json({
    ok: true,
    order,
    mode: "manual-pending",
    storage,
    wallet,
    checkoutUrl: /^[a-zA-Z0-9_]+$/.test(telegram) ? `https://t.me/${telegram}?text=${encodeURIComponent(text)}` : undefined,
    message: "Заявка создана. Уточните стоимость и подключение в поддержке. Plus активируется только после подтверждения; деньги не списаны.",
  })
}
