import { NextResponse } from "next/server"

import { liveModel, mintLiveToken, voiceKeySource } from "@/lib/server/gemini-live-token"
import { LIVE_WS_URL, buildLiveSetup, safeLiveLanguage, type LiveLanguage } from "@/lib/voice/gemini-live-setup"
import { detectSpokenLanguageDetailed } from "@/lib/voice/voice-language"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 45

/**
 * Does Voice actually work?
 *
 * Every other test in this repository proves that our side of the wire
 * behaves. None of them can prove that Google accepts what we send, because
 * none of them has the key - it lives on Render and nowhere else. So this runs
 * from the server that does have it: it mints a real ephemeral token, opens
 * the real websocket, sends the very same setup the browser sends, asks one
 * short question and waits for the audio to come back.
 *
 * Each step answers one thing that can go wrong, in words, so that a broken
 * Voice is a sentence rather than a console log: the key is missing, the model
 * name is wrong, one setup field was refused, the answer came back in the
 * wrong language.
 *
 * It is not free - it spends a few seconds of Live quota - so the result is
 * held for half a minute and the same answer is served to anyone who asks
 * again in the meantime.
 */

type Status = "ok" | "warn" | "fail"
type Step = { step: string; title: string; status: Status; detail: string }

type CheckResult = {
  ok: boolean
  checkedAt: string
  elapsedMs: number
  model: string
  language: LiveLanguage
  summary: string
  steps: Step[]
}

type CheckGlobal = typeof globalThis & {
  __malikVoiceLiveCheck?: { at: number; key: string; result: CheckResult }
  __malikVoiceLiveCheckRunning?: Promise<CheckResult>
}

const HOLD_MS = 30_000
const PROMPTS: Record<LiveLanguage, string> = {
  kk: "Қазақша бір қысқа сөйлеммен амандас.",
  ru: "Поздоровайся одним коротким предложением по-русски.",
  en: "Say hello in one short English sentence.",
}

function frameText(data: unknown): Promise<string> {
  if (typeof data === "string") return Promise.resolve(data)
  if (data instanceof ArrayBuffer) return Promise.resolve(Buffer.from(data).toString("utf8"))
  if (ArrayBuffer.isView(data)) return Promise.resolve(Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString("utf8"))
  const blob = data as { text?: () => Promise<string> }
  if (typeof blob?.text === "function") return blob.text()
  return Promise.resolve("")
}

async function runCheck(language: LiveLanguage): Promise<CheckResult> {
  const startedAt = Date.now()
  const steps: Step[] = []
  const model = liveModel()
  const push = (step: string, title: string, status: Status, detail: string) => {
    steps.push({ step, title, status, detail })
    return status
  }
  const finish = (summary: string): CheckResult => ({
    ok: steps.every((item) => item.status !== "fail"),
    checkedAt: new Date(startedAt).toISOString(),
    elapsedMs: Date.now() - startedAt,
    model,
    language,
    summary,
    steps,
  })

  // 1. The key -------------------------------------------------------------
  const source = voiceKeySource()
  if (!source.key) {
    push("key", "Ключ Voice", "fail", "Переменная MALIK_VOICE_GEMINI_KEY не задана на сервере.")
    return finish("Голос не заработает: на Render нет ключа Voice.")
  }
  push("key", "Ключ Voice", "ok", `Взят из ${source.name}.`)

  // 2. The ephemeral token -------------------------------------------------
  const tokenStartedAt = Date.now()
  const minted = await mintLiveToken(2)
  if (!minted.ok) {
    push("token", "Одноразовый токен", "fail", minted.message)
    return finish("Не удалось получить токен для голосовой сессии.")
  }
  push("token", "Одноразовый токен", "ok", `Выдан за ${Date.now() - tokenStartedAt} мс.`)

  // 3–5. The session itself ------------------------------------------------
  const Socket = (globalThis as typeof globalThis & { WebSocket?: typeof WebSocket }).WebSocket
  if (!Socket) {
    push("socket", "Голосовое соединение", "fail", `В этой среде Node нет WebSocket (${process.version}). Нужен Node 22 или новее.`)
    return finish("Проверку нельзя выполнить: среда без WebSocket.")
  }

  const socket = new Socket(`${LIVE_WS_URL}?access_token=${encodeURIComponent(minted.token)}`)
  const openedAt = Date.now()
  let setupAt = 0
  let firstAudioAt = 0
  let audioBytes = 0
  let spoken = ""
  let resumeHandle = ""
  let closeCode = 0
  let closeReason = ""

  const done = await new Promise<"answered" | "setup-only" | "closed" | "timeout">((resolve) => {
    let settled = false
    const settle = (value: "answered" | "setup-only" | "closed" | "timeout") => {
      if (settled) return
      settled = true
      clearTimeout(guard)
      try { socket.close(1000, "check complete") } catch {}
      resolve(value)
    }
    const guard = setTimeout(() => settle(setupAt ? "setup-only" : "timeout"), 26_000)

    socket.onopen = () => {
      // The very same setup the browser sends - imported, not rebuilt, so that
      // a setup Google accepts here is a setup Google accepts there.
      socket.send(JSON.stringify(buildLiveSetup({ model, language, voice: "Charon" })))
    }

    socket.onmessage = async (event: MessageEvent) => {
      let message: Record<string, any>
      try { message = JSON.parse(await frameText(event.data)) }
      catch { return }

      if (message.setupComplete) {
        setupAt = Date.now()
        socket.send(JSON.stringify({
          clientContent: {
            turns: [{ role: "user", parts: [{ text: PROMPTS[language] }] }],
            turnComplete: true,
          },
        }))
        return
      }

      const handle = message.sessionResumptionUpdate?.newHandle
      if (typeof handle === "string" && handle) resumeHandle = handle

      const server = message.serverContent
      if (!server) return

      const said = String(server.outputTranscription?.text || "")
      if (said) spoken += said

      for (const part of server.modelTurn?.parts || []) {
        const inline = part?.inlineData || part?.inline_data
        const mime = String(inline?.mimeType || inline?.mime_type || "")
        if (typeof inline?.data === "string" && /^audio\/pcm/i.test(mime)) {
          if (!firstAudioAt) firstAudioAt = Date.now()
          audioBytes += Buffer.from(inline.data, "base64").byteLength
        }
      }

      if (server.turnComplete && audioBytes) {
        // The resumption handle usually arrives alongside the first turn, and
        // sometimes just after it. Waiting a moment is the difference between
        // reporting that reconnect works and guessing that it does.
        if (resumeHandle) settle("answered")
        else setTimeout(() => settle("answered"), 900)
      }
    }

    socket.onerror = () => { if (!setupAt) settle("closed") }
    socket.onclose = (event: CloseEvent) => {
      closeCode = event.code
      closeReason = event.reason || ""
      settle(setupAt ? (audioBytes ? "answered" : "setup-only") : "closed")
    }
  })

  if (!setupAt) {
    const why = closeCode === 1007 || closeCode === 1008
      ? "Сервис отклонил параметры сессии — скорее всего дело в имени модели или в одном из полей setup."
      : closeCode === 1011
        ? "Сервис закрыл соединение со своей стороны."
        : done === "timeout"
          ? "Сервис не ответил за 26 секунд."
          : `Соединение закрылось, код ${closeCode || "неизвестен"}.`
    push("socket", "Голосовое соединение", "fail", `${why}${closeReason ? ` (${closeReason})` : ""}`)
    return finish(`Сессия не открылась. Модель в настройках: ${model}.`)
  }

  push("socket", "Голосовое соединение", "ok", `Websocket открыт и setup принят за ${setupAt - openedAt} мс. Модель ${model}.`)
  push(
    "resume",
    "Восстановление после обрыва",
    resumeHandle ? "ok" : "warn",
    resumeHandle
      ? "Сервис выдал handle — после обрыва разговор продолжится с того же места."
      : "Сервис не прислал handle. Связь работает, но после обрыва разговор начнётся заново.",
  )

  if (!audioBytes) {
    push("answer", "Ответ голосом", "fail", done === "setup-only"
      ? "Сессия открылась, но модель не прислала звук."
      : `Ответа не было (код ${closeCode || "нет"}).`)
    return finish("Сессия открывается, но модель молчит.")
  }

  const seconds = audioBytes / 2 / 24000
  push("answer", "Ответ голосом", "ok", `Первый звук через ${firstAudioAt - setupAt} мс, всего ${seconds.toFixed(1)} с речи.`)

  // 6. The language --------------------------------------------------------
  const said = spoken.trim()
  if (!said) {
    push("language", "Язык ответа", "warn", "Модель ответила голосом, но расшифровку не прислала — язык проверить нечем.")
  } else if (language !== "en" && /^[\p{Script=Latin}\p{P}\p{N}\s]+$/u.test(said)) {
    push("language", "Язык ответа", "fail", `Ответ пришёл латиницей — это английский: «${said.slice(0, 80)}».`)
  } else {
    const detected = detectSpokenLanguageDetailed(said)
    const right = detected.code === language
    push(
      "language",
      "Язык ответа",
      right ? "ok" : "warn",
      right
        ? `Ответил на нужном языке: «${said.slice(0, 80)}».`
        : `Просили ${language}, определилось «${detected.code || "неясно"}»: «${said.slice(0, 80)}».`,
    )
  }

  const failed = steps.filter((item) => item.status === "fail").length
  const warned = steps.filter((item) => item.status === "warn").length
  return finish(failed
    ? "Есть проблема — смотри шаги ниже."
    : warned
      ? "Голос работает, но есть замечания."
      : `Голос работает: ${model} отвечает за ${firstAudioAt - setupAt} мс.`)
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const language = safeLiveLanguage(url.searchParams.get("language") || "kk")
  const scope = globalThis as CheckGlobal
  const key = `${language}`

  const held = scope.__malikVoiceLiveCheck
  if (!url.searchParams.has("force") && held && held.key === key && Date.now() - held.at < HOLD_MS) {
    return NextResponse.json({ ...held.result, cached: true }, { headers: { "cache-control": "no-store" } })
  }

  // One check at a time: two people pressing the button must not open two
  // paid sessions.
  if (!scope.__malikVoiceLiveCheckRunning) {
    scope.__malikVoiceLiveCheckRunning = runCheck(language).finally(() => {
      scope.__malikVoiceLiveCheckRunning = undefined
    })
  }
  const result = await scope.__malikVoiceLiveCheckRunning
  scope.__malikVoiceLiveCheck = { at: Date.now(), key, result }
  return NextResponse.json(result, { headers: { "cache-control": "no-store" } })
}
