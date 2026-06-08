import { getAwsCreds, signAwsRequest } from "./sigv4"

/**
 * AWS Translate — server-side machine translation (KZ/RU/EN and more).
 * Used as a deterministic translation backbone for the Newsroom Language Desk.
 */

export type TranslateLang = "auto" | "kk" | "ru" | "en"

export type TranslateResult = {
  ok: boolean
  translated?: string
  sourceLang?: string
  targetLang?: string
  error?: string
}

export function isAwsTranslateConfigured(): boolean {
  return getAwsCreds() !== null
}

export async function awsTranslateText(
  text: string,
  target: TranslateLang,
  source: TranslateLang = "auto",
  signal?: AbortSignal,
): Promise<TranslateResult> {
  const creds = getAwsCreds()
  if (!creds) return { ok: false, error: "AWS credentials missing" }
  const clean = (text || "").trim()
  if (!clean) return { ok: false, error: "empty text" }
  if (target === "auto") return { ok: false, error: "target language required" }

  const body = JSON.stringify({
    Text: clean.slice(0, 9000),
    SourceLanguageCode: source,
    TargetLanguageCode: target,
  })

  const signed = signAwsRequest(creds, {
    service: "translate",
    host: `translate.${creds.region}.amazonaws.com`,
    body,
    contentType: "application/x-amz-json-1.1",
    extraHeaders: {
      "x-amz-target": "AWSShineFrontendService_20170701.TranslateText",
    },
  })

  try {
    const response = await fetch(signed.url, {
      method: "POST",
      headers: signed.headers,
      body: signed.body,
      signal,
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      return { ok: false, error: data?.Message || data?.message || `AWS Translate ${response.status}` }
    }
    return {
      ok: true,
      translated: String(data?.TranslatedText || ""),
      sourceLang: String(data?.SourceLanguageCode || source),
      targetLang: String(data?.TargetLanguageCode || target),
    }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "translate failed" }
  }
}
