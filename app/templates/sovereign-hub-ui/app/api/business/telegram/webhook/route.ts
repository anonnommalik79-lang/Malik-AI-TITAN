import { timingSafeEqual } from "node:crypto"

export const runtime = "nodejs"

type TelegramUpdate = {
  message?: {
    message_id?: number
    chat?: { id?: number; type?: string }
    from?: { id?: number; first_name?: string; last_name?: string; username?: string; language_code?: string }
    text?: string
    contact?: { phone_number?: string; first_name?: string; last_name?: string; user_id?: number }
  }
}

function safeEqual(left?: string | null, right?: string | null) {
  if (!left || !right) return false
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  return a.length === b.length && timingSafeEqual(a, b)
}

function config() {
  const token = process.env.TELEGRAM_BUSINESS_BOT_TOKEN?.trim()
  const secret = process.env.TELEGRAM_BUSINESS_WEBHOOK_SECRET?.trim()
  return token && secret ? { token, secret } : null
}

async function telegramSend(token: string, chatId: number, text: string) {
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      reply_markup: {
        inline_keyboard: [
          [
            { text: "Сайт + AI + бот", callback_data: "full_system" },
            { text: "AI-бот", callback_data: "ai_bot" },
          ],
          [{ text: "Получить прототип", url: "https://malikaiworld.world/business#apply" }],
        ],
      },
    }),
    cache: "no-store",
  })
  return response.ok
}

async function storeInboundLead(update: TelegramUpdate, text: string) {
  const supabaseUrl = process.env.SUPABASE_URL?.trim()?.replace(/\/$/, "")
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  const message = update.message
  const chatId = message?.chat?.id
  if (!supabaseUrl || !serviceKey || !chatId) return

  const from = message?.from
  const contact = message?.contact?.phone_number || (from?.username ? `@${from.username}` : `telegram:${chatId}`)
  const name = [message?.contact?.first_name || from?.first_name, message?.contact?.last_name || from?.last_name].filter(Boolean).join(" ") || "Telegram lead"

  const row = {
    external_id: `telegram:${chatId}`,
    name,
    company: "Telegram inbound",
    contact,
    niche: "Website + AI + Bot",
    website: "",
    message: text.slice(0, 1200),
    source: "telegram-bot",
    lang: from?.language_code?.toLowerCase().startsWith("kk") ? "kk" : "ru",
    status: "new",
    priority: "normal",
    updated_at: new Date().toISOString(),
  }

  await fetch(`${supabaseUrl}/rest/v1/business_leads?on_conflict=external_id`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      authorization: `Bearer ${serviceKey}`,
      "content-type": "application/json",
      prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(row),
    cache: "no-store",
  }).catch(() => undefined)
}

export async function GET() {
  return Response.json({ ok: true, service: "malik-business-telegram-webhook", configured: Boolean(config()) })
}

export async function POST(request: Request) {
  const cfg = config()
  if (!cfg) return Response.json({ ok: false, error: "telegram_not_configured" }, { status: 503 })

  const incomingSecret = request.headers.get("x-telegram-bot-api-secret-token")
  if (!safeEqual(incomingSecret, cfg.secret)) {
    return Response.json({ ok: false, error: "invalid_webhook_secret" }, { status: 401 })
  }

  const update = (await request.json().catch(() => ({}))) as TelegramUpdate
  const chatId = update.message?.chat?.id
  const text = String(update.message?.text || "").trim()
  const phone = update.message?.contact?.phone_number
  if (!chatId) return Response.json({ ok: true, ignored: true })

  const normalized = text.toLowerCase()
  let reply = "Здравствуйте! Я Malik Business Bot. Помогаю подобрать систему: сайт + AI-консультант + Telegram/WhatsApp-бот + заявки. Напишите, какой у вас бизнес и что хотите автоматизировать."

  if (normalized === "/start") {
    reply = "Здравствуйте! 👋 Я Malik Business Bot.\n\nМогу показать, как для вашего бизнеса будет работать связка:\n• премиальный сайт\n• AI-консультант 24/7\n• Telegram/WhatsApp-бот\n• сбор и квалификация заявок\n\nНапишите вашу нишу — например: стоматология, салон, обучение, автосервис."
  } else if (phone) {
    reply = "Спасибо! Контакт принят. Заявка передана в Malik Lead OS. Мы используем его только для связи по вашему запросу."
  } else if (/стомат|clinic|dental|медицин|клиник/i.test(text)) {
    reply = "Для клиники можно собрать сайт + AI-консультант по услугам и записи + бот для напоминаний и заявок. AI не ставит диагнозы и не заменяет врача. Хотите полный пакет или сначала бесплатный прототип?"
  } else if (/салон|beauty|барбер|hair/i.test(text)) {
    reply = "Для салона я бы сделал каталог услуг, AI-консультанта, запись и бот с напоминаниями/возвратом клиентов. Напишите город и примерный объём услуг — подготовим прототип."
  } else if (/цена|стоим|price|қанша/i.test(text)) {
    reply = "Ориентир: Website от 180 000 ₸, Website + Bot от 390 000 ₸, полный AI Business System от 690 000 ₸. Финальная цена зависит от интеграций. Какой формат нужен вам?"
  }

  await Promise.all([
    telegramSend(cfg.token, chatId, reply),
    storeInboundLead(update, text || (phone ? `Shared phone: ${phone}` : "Telegram interaction")),
  ])

  return Response.json({ ok: true })
}
