import { awsTranslateText, isAwsTranslateConfigured, type TranslateLang } from "@/lib/aws/translate"

export const runtime = "nodejs"

const LANGS = new Set(["auto", "kk", "ru", "en"])

type TranslateBody = {
  text?: string
  target?: string
  source?: string
}

export async function GET() {
  return Response.json({ ok: true, configured: isAwsTranslateConfigured() })
}

export async function POST(request: Request) {
  if (!isAwsTranslateConfigured()) {
    return Response.json({ ok: false, error: "AWS не настроен (нет ключей)" }, { status: 503 })
  }

  const body = (await request.json().catch(() => ({}))) as TranslateBody
  const text = String(body.text || "").trim()
  const target = String(body.target || "").trim() as TranslateLang
  const source = (String(body.source || "auto").trim() || "auto") as TranslateLang

  if (!text) return Response.json({ ok: false, error: "text required" }, { status: 400 })
  if (!LANGS.has(target) || target === "auto") {
    return Response.json({ ok: false, error: "target must be kk|ru|en" }, { status: 400 })
  }
  if (!LANGS.has(source)) {
    return Response.json({ ok: false, error: "invalid source" }, { status: 400 })
  }

  const result = await awsTranslateText(text, target, source)
  if (!result.ok) return Response.json(result, { status: 502 })
  return Response.json(result)
}
