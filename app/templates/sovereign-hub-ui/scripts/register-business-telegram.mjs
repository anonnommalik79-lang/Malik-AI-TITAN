const token = String(process.env.TELEGRAM_BUSINESS_BOT_TOKEN || "").trim()
const secret = String(process.env.TELEGRAM_BUSINESS_WEBHOOK_SECRET || "").trim()
const origin = String(process.env.MALIK_PUBLIC_ORIGIN || "https://malikaiworld.world").trim().replace(/\/$/, "")

if (!token || !secret) {
  console.error("Missing TELEGRAM_BUSINESS_BOT_TOKEN or TELEGRAM_BUSINESS_WEBHOOK_SECRET")
  process.exit(1)
}

const webhookUrl = `${origin}/api/business/telegram/webhook`
const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    url: webhookUrl,
    secret_token: secret,
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: true,
  }),
})

const payload = await response.json().catch(() => ({}))
if (!response.ok || payload?.ok !== true) {
  console.error("Telegram setWebhook failed", payload)
  process.exit(1)
}

console.log(`Telegram webhook configured: ${webhookUrl}`)
