import { createHmac, timingSafeEqual } from "node:crypto"

export const runtime = "nodejs"

function safeEqual(left?: string | null, right?: string | null) {
  if (!left || !right) return false
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  return a.length === b.length && timingSafeEqual(a, b)
}

function config() {
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN?.trim()
  const appSecret = process.env.WHATSAPP_APP_SECRET?.trim()
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN?.trim()
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim()
  const graphVersion = process.env.WHATSAPP_GRAPH_VERSION?.trim()
  return { verifyToken, appSecret, accessToken, phoneNumberId, graphVersion }
}

function signatureValid(rawBody: string, signature: string | null, appSecret?: string) {
  if (!appSecret || !signature?.startsWith("sha256=")) return false
  const expected = `sha256=${createHmac("sha256", appSecret).update(rawBody).digest("hex")}`
  return safeEqual(signature, expected)
}

async function sendWhatsAppText(to: string, body: string) {
  const cfg = config()
  if (!cfg.accessToken || !cfg.phoneNumberId || !cfg.graphVersion) return false
  const response = await fetch(`https://graph.facebook.com/${cfg.graphVersion}/${cfg.phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${cfg.accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: { preview_url: false, body },
    }),
    cache: "no-store",
  })
  return response.ok
}

async function storeWhatsAppLead(args: { waId: string; name: string; text: string }) {
  const supabaseUrl = process.env.SUPABASE_URL?.trim()?.replace(/\/$/, "")
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!supabaseUrl || !serviceKey) return

  const row = {
    external_id: `whatsapp:${args.waId}`,
    name: args.name || "WhatsApp lead",
    company: "WhatsApp inbound",
    contact: args.waId,
    niche: "Website + AI + Bot",
    website: "",
    message: args.text.slice(0, 1200),
    source: "whatsapp-bot",
    lang: "ru",
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

export async function GET(request: Request) {
  const url = new URL(request.url)
  const mode = url.searchParams.get("hub.mode")
  const token = url.searchParams.get("hub.verify_token")
  const challenge = url.searchParams.get("hub.challenge") || ""
  const cfg = config()

  if (mode === "subscribe" && cfg.verifyToken && safeEqual(token, cfg.verifyToken)) {
    return new Response(challenge, { status: 200, headers: { "content-type": "text/plain" } })
  }
  return new Response("forbidden", { status: 403 })
}

export async function POST(request: Request) {
  const cfg = config()
  const raw = await request.text()
  if (!signatureValid(raw, request.headers.get("x-hub-signature-256"), cfg.appSecret)) {
    return Response.json({ ok: false, error: "invalid_signature" }, { status: 401 })
  }

  const payload = JSON.parse(raw || "{}") as any
  const value = payload?.entry?.[0]?.changes?.[0]?.value
  const message = value?.messages?.[0]
  const contact = value?.contacts?.[0]
  const waId = String(message?.from || contact?.wa_id || "").trim()
  const text = String(message?.text?.body || "").trim()
  const name = String(contact?.profile?.name || "WhatsApp lead").trim()

  if (!waId || !message) return Response.json({ ok: true, ignored: true })

  let reply = "Здравствуйте! Я Malik Business Bot. Помогу подобрать систему сайт + AI + бот + заявки. Напишите, какой у вас бизнес и что хотите автоматизировать."
  if (/цена|стоим|price|қанша/i.test(text)) {
    reply = "Ориентир: Website от 180 000 ₸, Website + Bot от 390 000 ₸, полный AI Business System от 690 000 ₸. Финальная стоимость зависит от интеграций. Какой вариант вам ближе?"
  } else if (/стомат|clinic|dental|клиник/i.test(text)) {
    reply = "Для клиники можно собрать сайт, AI-консультанта по услугам и записи и бот с напоминаниями. AI не ставит диагнозы и не заменяет врача. Могу предложить бесплатный персональный прототип."
  } else if (/сайт|website|лендинг/i.test(text)) {
    reply = "Да. Мы делаем не просто сайт: подключаем AI-консультанта, бота и единый поток заявок. Если напишете нишу и текущий сайт, подготовим точный сценарий."
  }

  await Promise.all([
    sendWhatsAppText(waId, reply),
    storeWhatsAppLead({ waId, name, text: text || "WhatsApp interaction" }),
  ])

  return Response.json({ ok: true })
}
