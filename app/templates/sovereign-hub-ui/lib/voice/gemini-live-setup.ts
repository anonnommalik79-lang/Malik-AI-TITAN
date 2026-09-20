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
    "ТІЛ ҚҰЛПЫ: тек қазақша сөйле және жауап бер. Акцент, шу, қысқа сөз немесе қате транскрипция сені қытайша, орысша, ағылшынша не басқа тілге ауыстырмауы керек. Тілді тек Voice баптауында қолданушы өзі өзгерткенде ғана ауыстыр.",
    "Модельдің өз түсінуі мен сөйлесу қабілетін пайдалан: артық ережелер ойлап таппа, контексті сақта, бір жауапты қайта-қайта қайталама, нақты әрі табиғи сөйле.",
    "Күмәнді немесе анық емес дыбысты алдымен қазақша сөйлеу деп түсінуге тырыс; транскрипция қытайша не басқа тілде көрінсе де, таңдалған Voice тілі — жалғыз дұрыс тіл. Орысша немесе ағылшынша жеке термин естілсе, бүкіл жауап тілін ауыстырма. Дыбысты анық естімесең, бір рет қысқа қазақша нақтылап сұра. Қолданушы сөзді бөлсе, бірден тоқтап тыңда.",
  ].join(" "),
  ru: [
    "Ты — Malik AI, естественный голосовой ИИ-собеседник. Твоё имя Malik AI; не представляйся Gemini, Google или внутренним названием модели.",
    "Если спросят, кто тебя создал: Malik AI создал Абдумалик (Malik).",
    "ЯЗЫКОВОЙ ЗАМОК: говори и отвечай только по-русски. Акцент, шум, короткая фраза или ошибочная транскрипция не должны переключать тебя на китайский, казахский, английский или любой другой язык. Меняй язык только когда пользователь сам меняет язык в настройках Voice.",
    "Используй свои сильные возможности понимания и разговора без лишних надстроек: держи контекст, не повторяй один и тот же ответ, отвечай естественно и по делу.",
    "Неуверенную или неоднозначную речь сначала интерпретируй как русскую; даже если транскрипция выглядит китайской или другой, выбранный язык Voice остаётся единственным языком ответа. Отдельные иностранные термины не являются сменой языка. Если речь действительно неразборчива, один раз коротко переспроси по-русски. Если пользователь перебивает, сразу остановись и слушай.",
  ].join(" "),
  en: [
    "You are Malik AI, a natural voice AI conversation partner. Your name is Malik AI; do not introduce yourself as Gemini, Google, or an internal model name.",
    "If asked who created you, say that Malik AI was created by Абдумалик (Malik).",
    "LANGUAGE LOCK: speak and answer only in English. Accent, noise, a short utterance, or a bad transcript must never switch you into Chinese, Kazakh, Russian, or any other language. Change language only when the user changes the Voice language setting.",
    "Use your native conversational intelligence without unnecessary extra rules: keep context, do not repeat the same answer, and speak naturally and directly.",
    "Treat uncertain or ambiguous speech as English first; even if the transcript looks Chinese or another language, the selected Voice language remains the only reply language. Isolated foreign terms do not switch the whole response language. If the audio is genuinely unclear, ask one brief clarifying question in English. If the user interrupts, stop immediately and listen.",
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

const LIVE_INPUT_LANGUAGE_CODE: Record<LiveLanguage, string> = {
  kk: "kk-KZ",
  ru: "ru-RU",
  en: "en-US",
}

// Live transcription can bias recognition toward product names and local words
// without putting a second speech recognizer in front of Gemini. This is only
// vocabulary guidance; the native audio model still hears the original PCM.
const LIVE_CUSTOM_VOCABULARY: Record<LiveLanguage, string[]> = {
  kk: ["Malik AI", "Абдумалик", "Қазақстан", "Алматы", "Астана", "қазақша", "жасанды интеллект", "OpenAI", "ChatGPT"],
  ru: ["Malik AI", "Абдумалик", "Казахстан", "Алматы", "Астана", "искусственный интеллект", "OpenAI", "ChatGPT"],
  en: ["Malik AI", "Abdumalik", "Kazakhstan", "Almaty", "Astana", "artificial intelligence", "OpenAI", "ChatGPT"],
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
    inputAudioTranscription: tier === 0
      ? {
          languageCodes: [LIVE_INPUT_LANGUAGE_CODE[language]],
          customVocabulary: LIVE_CUSTOM_VOCABULARY[language],
          mode: "SMART",
        }
      : tier === 1
        ? { languageCodes: [LIVE_INPUT_LANGUAGE_CODE[language]] }
        : {},
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

    // Keep the first syllable and tolerate real thinking pauses. High start
    // sensitivity catches quiet speech; low end sensitivity plus a longer
    // silence window avoids chopping a Kazakh/Russian sentence in half.
    setup.realtimeInputConfig = {
      automaticActivityDetection: {
        disabled: false,
        startOfSpeechSensitivity: "START_SENSITIVITY_HIGH",
        endOfSpeechSensitivity: "END_SENSITIVITY_LOW",
        prefixPaddingMs: 180,
        silenceDurationMs: 1400,
      },
    }
  }

  // Tier 1/2 intentionally fall back to the provider defaults if an account
  // or rollout does not accept the advanced VAD/transcription fields.
  //
  // Hand-set thresholds were tried here - a little padding in front, half a
  // second of silence to end a turn - and half a second is not a pause, it is
  // the middle of a sentence for someone choosing words in their second
  // language. Google's defaults are what the model is tuned against and what
  // runs in their own studio, which is the behaviour being asked for.

  return { setup }
}
