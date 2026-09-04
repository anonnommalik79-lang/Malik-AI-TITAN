import { timingSafeEqual } from "node:crypto"

export const runtime = "nodejs"

type TelegramUser = {
  id?: number
  first_name?: string
  last_name?: string
  username?: string
  language_code?: string
}

type TelegramMessage = {
  message_id?: number
  chat?: { id?: number; type?: string }
  from?: TelegramUser
  text?: string
  contact?: { phone_number?: string; first_name?: string; last_name?: string; user_id?: number }
}

type TelegramUpdate = {
  message?: TelegramMessage
  callback_query?: {
    id?: string
    data?: string
    from?: TelegramUser
    message?: TelegramMessage
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

async function telegramCall(token: string, method: string, body: Record<string, unknown>) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  })
  return response.ok
}

async function telegramSend(token: string, chatId: number, text: string) {
  return telegramCall(token, "sendMessage", {
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
  })
}

async function storeInboundLead(args: {
  chatId: number
  from?: TelegramUser
  contactPhone?: string
  contactFirstName?: string
  contactLastName?: string
  text: string
}) {
  const supabaseUrl = process.env.SUPABASE_URL?.trim()?.replace(/\/$/, "")
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!supabaseUrl || !serviceKey) return

  const contact = args.contactPhone || (args.from?.username ? `@${args.from.username}` : `telegram:${args.chatId}`)
  const name = [args.contactFirstName || args.from?.first_name, args.contactLastName || args.from?.last_name].filter(Boolean).join(" ") || "Telegram lead"

  const row = {
    external_id: `telegram:${args.chatId}`,
    name,
    company: "Telegram inbound",
    contact,
    niche: "Website + AI + Bot",
    website: "",
    message: args.text.slice(0, 1200),
    source: "telegram-bot",
    lang: args.from?.language_code?.toLowerCase().startsWith("kk") ? "kk" : "ru",
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
  const callback = update.callback_query
  const message = update.message || callback?.message
  const from = update.message?.from || callback?.from
  const chatId = message?.chat?.id
  const callbackData = String(callback?.data || "").trim()
  const text = String(update.message?.text || callbackData || "").trim()
  const phone = update.message?.contact?.phone_number
  if (!chatId) return Response.json({ ok: true, ignored: true })

  const normalized = text.toLowerCase()
  let reply = "Здравствуйте! Я Malik Business Bot. Помогаю подобрать систему: сайт + AI-консультант + Telegram/WhatsApp-бот + заявки. Напишите, какой у вас бизнес и что хотите автоматизировать."

  if (normalized === "/start") {
    reply = "Здравствуйте! 👋 Я Malik Business Bot.\n\nМогу показать, как для вашего бизнеса будет работать связка:\n• премиальный сайт\n• AI-консультант 24/7\n• Telegram/WhatsApp-бот\n• сбор и квалификация заявок\n\nНапишите вашу нишу — например: стоматология, салон, обучение, автосервис."
  } else if (callbackData === "full_system") {
    reply = "Полная система включает сайт + AI-консультанта + Telegram/WhatsApp-бот + Lead OS. Ориентир — от 690 000 ₸. Напишите нишу и текущий сайт, если он есть — подготовим персональный прототип."
  } else if (callbackData === "ai_bot") {
    reply = "AI-бот отвечает на типовые вопросы, аккуратно квалифицирует запрос и передаёт контакт человеку. Для старта напишите вашу нишу и 3 главные услуги."
  } else if (phone) {
    reply = "Спасибо! Контакт принят. Заявка передана в Malik Lead OS. Мы используем его только для связи по вашему запросу."
  } else if (/стомат|clinic|dental|медицин|клиник/i.test(text)) {
    reply = "Для клиники можно собрать сайт + AI-консультант по услугам и записи + бот для напоминаний и заявок. AI не ставит диагнозы и не заменяет врача. Хотите полный пакет или сначала бесплатный прототип?"
  } else if (/салон|beauty|барбер|hair/i.test(text)) {
    reply = "Для салона я бы сделал каталог услуг, AI-консультанта, запись и бот с напоминаниями/возвратом клиентов. Напишите город и примерный объём услуг — подготовим прототип."
  } else if (/цена|стоим|price|қанша/i.test(text)) {
    reply = "Ориентир: Website от 180 000 ₸, Website + Bot от 390 000 ₸, полный AI Business System от 690 000 ₸. Финальная цена зависит от интеграций. Какой формат нужен вам?"
  }

  const tasks: Promise<unknown>[] = [
    telegramSend(cfg.token, chatId, reply),
    storeInboundLead({
      chatId,
      from,
      contactPhone: phone,
      contactFirstName: update.message?.contact?.first_name,
      contactLastName: update.message?.contact?.last_name,
      text: text || (phone ? `Shared phone: ${phone}` : "Telegram interaction"),
    }),
  ]
  if (callback?.id) {
    tasks.push(telegramCall(cfg.token, "answerCallbackQuery", { callback_query_id: callback.id }))
  }
  await Promise.all(tasks)

  return Response.json({ ok: true })
}
