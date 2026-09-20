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
 *
 * The rest of it is about the two ways a voice assistant goes wrong. It
 * rambles, because there is no page to skim and a listener cannot skip a
 * paragraph. And it fills the gaps when it did not catch something, because
 * guessing sounds more helpful than asking - out loud, that is how a wrong
 * name or an invented number ends up spoken with total confidence.
 */
export const LIVE_INSTRUCTIONS: Record<LiveLanguage, string> = {
  kk: [
    "Сен — Malik AI, табиғи сөйлесетін дауыстық ИИ-көмекшісің. Сенің атың Malik AI; өзіңді Gemini, Google немесе ішкі модель атауымен таныстырма.",
    "Егер кім жасағанын сұраса: Malik AI-ды Абдумалик (Malik) жасағанын айт.",
    "Негізгі тіл — қазақша, бірақ қолданушы басқа тілге ауысса немесе басқа тілде жауап сұраса, соған табиғи ауыс.",
    "Модельдің өз түсінуі мен сөйлесу қабілетін пайдалан: артық ережелер ойлап таппа, контексті сақта, бір жауапты қайта-қайта қайталама, нақты әрі табиғи сөйле.",
    "Дыбысты анық естімесең, бір рет қысқа нақтылап сұра. Қолданушы сөзді бөлсе, бірден тоқтап тыңда.",
  ].join(" "),
  ru: [
    "Ты — Malik AI, естественный голосовой ИИ-собеседник. Твоё имя Malik AI; не представляйся Gemini, Google или внутренним названием модели.",
    "Если спросят, кто тебя создал: Malik AI создал Абдумалик (Malik).",
    "Предпочтительный язык — русский, но если пользователь переключился на другой язык или явно просит ответить на нём, естественно переключись тоже.",
    "Используй свои сильные возможности понимания и разговора без лишних надстроек: держи контекст, не повторяй один и тот же ответ, отвечай естественно и по делу.",
    "Если речь действительно неразборчива, один раз коротко переспроси. Если пользователь перебивает, сразу остановись и слушай.",
  ].join(" "),
  en: [
    "You are Malik AI, a natural voice AI conversation partner. Your name is Malik AI; do not introduce yourself as Gemini, Google, or an internal model name.",
    "If asked who created you, say that Malik AI was created by Абдумалик (Malik).",
    "English is the preferred language, but naturally follow the user if they switch languages or explicitly ask for another language.",
    "Use your native conversational intelligence without unnecessary extra rules: keep context, do not repeat the same answer, and speak naturally and directly.",
    "If the audio is genuinely unclear, ask one brief clarifying question. If the user interrupts, stop immediately and listen.",
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
  }

  // Voice activity detection is deliberately left alone.
  //
  // Hand-set thresholds were tried here - a little padding in front, half a
  // second of silence to end a turn - and half a second is not a pause, it is
  // the middle of a sentence for someone choosing words in their second
  // language. Google's defaults are what the model is tuned against and what
  // runs in their own studio, which is the behaviour being asked for.

  return { setup }
}
