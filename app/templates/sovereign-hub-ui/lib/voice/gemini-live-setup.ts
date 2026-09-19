/**
 * The setup message, in one place.
 *
 * The browser sends this to open a Live session, and the self-check at
 * /api/voice/gemini-live-check sends the very same thing to Google from the
 * server. That is the entire point of it living here: a check that builds its
 * own setup proves only that the check works. This way, when the check says
 * the connection is good, it is the real conversation's setup that Google
 * accepted.
 *
 * Nothing in this file may touch the browser or the server - it is imported by
 * both.
 */

export type LiveLanguage = "kk" | "ru" | "en"

export const LIVE_WS_URL = "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained"
export const LIVE_TOKEN_URL = "https://generativelanguage.googleapis.com/v1beta/auth_tokens"
export const DEFAULT_LIVE_MODEL = "gemini-3.8-live"

/** Microphone audio is sent at this rate, whatever the hardware runs at. */
export const LIVE_INPUT_RATE = 16000

/**
 * The system prompt is written in the language of the answer.
 *
 * A model asked in English to "answer in the user's language" falls back to
 * English whenever the audio is unclear - which is exactly when the fallback
 * matters. Stating the rule in the target language, and repeating that noisy
 * audio does not change it, is what keeps the reply in one language.
 */
export const LIVE_INSTRUCTIONS: Record<LiveLanguage, string> = {
  kk: [
    "Сен — Malik AI Voice, дауыспен сөйлесетін көмекші.",
    "1-ЕРЕЖЕ: Жауапты ӘРҚАШАН тек қазақ тілінде бер. Дыбыс анық естілмесе де, бір сөз басқа тілде айтылса да — жауап бәрібір қазақша. Ағылшынша ЕШҚАШАН жауап берме.",
    "2-ЕРЕЖЕ: Түсінбесең, қазақша қысқа қайта сұра.",
    "3-ЕРЕЖЕ: Тірі адамша, қысқа әрі нақты сөйле. Әңгіме желісін ұстап отыр.",
    "4-ЕРЕЖЕ: Ішкі провайдерлерді, модель аттарын немесе API кілттерін ешқашан атама.",
  ].join(" "),
  ru: [
    "Ты — Malik AI Voice, голосовой собеседник.",
    "ПРАВИЛО 1: Отвечай ВСЕГДА только на русском языке. Даже если звук неразборчив или одно слово прозвучало на другом языке — ответ всё равно только на русском. НИКОГДА не отвечай по-английски.",
    "ПРАВИЛО 2: Если не расслышал — коротко переспроси по-русски.",
    "ПРАВИЛО 3: Говори живо, коротко и по делу. Держи нить разговора.",
    "ПРАВИЛО 4: Никогда не упоминай внутренних провайдеров, названия моделей или ключи API.",
  ].join(" "),
  en: [
    "You are Malik AI Voice, a spoken conversation partner.",
    "RULE 1: Always answer in English only. Even when the audio is unclear or a word arrives in another language, the answer stays English.",
    "RULE 2: When you did not catch something, ask again briefly in English.",
    "RULE 3: Speak naturally, short and to the point. Keep the thread of the conversation.",
    "RULE 4: Never mention internal providers, model names or API keys.",
  ].join(" "),
}

/** The prebuilt voices Gemini Live actually has. Anything else fails the setup. */
const LIVE_VOICE_NAMES = new Set([
  "Puck", "Charon", "Kore", "Aoede", "Fenrir", "Leda", "Achird", "Sulafat",
  "Iapetus", "Rasalgethi", "Schedar", "Gacrux", "Orus", "Algenib", "Sadaltager",
  "Alnilam", "Zubenelgenubi", "Laomedeia", "Algieba", "Enceladus", "Autonoe",
  "Vindemiatrix", "Sadachbia", "Achernar", "Zephyr", "Callirrhoe", "Erinome",
  "Despina", "Pulcherrima", "Umbriel",
])

export function safeLiveVoice(value: string) {
  const head = String(value || "").trim().split(/\s+/)[0]
  return LIVE_VOICE_NAMES.has(head) ? head : "Charon"
}

export function safeLiveLanguage(value: unknown): LiveLanguage {
  return value === "ru" || value === "en" || value === "kk" ? value : "kk"
}

export type LiveSetupInput = {
  model?: string
  voice?: string
  language?: LiveLanguage
  /** 0 = every documented option, 1 = core options, 2 = the bare minimum. */
  tier?: 0 | 1 | 2
  resumeHandle?: string | null
}

/**
 * Everything the session needs Google to know before the first word.
 *
 * The tiers exist because one unsupported field closes the websocket and takes
 * the whole feature with it. Losing sliding-window compression is a session
 * that ends early; losing Voice because of it is not a trade worth making, so
 * a refused setup is retried smaller rather than abandoned.
 */
export function buildLiveSetup(input: LiveSetupInput = {}) {
  const tier = input.tier ?? 0
  const language = safeLiveLanguage(input.language)
  const setup: Record<string, unknown> = {
    model: `models/${input.model || DEFAULT_LIVE_MODEL}`,
    generationConfig: {
      responseModalities: ["AUDIO"],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: safeLiveVoice(input.voice || "Charon") } },
      },
    },
    inputAudioTranscription: {},
    outputAudioTranscription: {},
    systemInstruction: { parts: [{ text: LIVE_INSTRUCTIONS[language] }] },
  }

  if (tier <= 1) {
    // Resuming is what makes a dropped link invisible: the restored session
    // still knows what was said before it dropped.
    setup.sessionResumption = input.resumeHandle ? { handle: input.resumeHandle } : {}
  }

  if (tier === 0) {
    // Without compression an audio session is cut off at its context limit -
    // a quarter of an hour of talking, then silence. Compression is what
    // Google documents as the way to keep a session open indefinitely.
    setup.contextWindowCompression = { slidingWindow: {} }
    setup.realtimeInputConfig = {
      automaticActivityDetection: {
        disabled: false,
        // A little padding in front keeps the first syllable; a short silence
        // window is what makes the answer start almost at once instead of
        // after a beat of waiting.
        prefixPaddingMs: 120,
        silenceDurationMs: 480,
      },
    }
  }

  return { setup }
}
