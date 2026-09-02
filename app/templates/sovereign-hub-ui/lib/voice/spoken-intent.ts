/** Narrow intent checks, not fuzzy rewrites of names or the recorded transcript. */
export function kazakhGreeting(text: string): "casual" | "polite" | null {
  const value = text.normalize("NFKC").toLowerCase()
    .replace(/[.,!?;:…]/gu, " ").replace(/\s+/gu, " ").trim()
  const match = /^(?:(?:с[әаэ]лем|сәлеметсіз бе|салеметсиз бе) )?(?:(?:sola|сола|malik ai|малик аи) )?([қк]алайсы[ңнз]|[қк]алайсыз|qalaysyn|kalaysyn|qalaisyn|qalaysyz|kalaysyz)(?: (?:sola|сола|malik ai|малик аи))?$/u.exec(value)
  return match ? (/з$|z$/.test(match[1]) ? "polite" : "casual") : null
}

export function spokenIntentInstruction(text: string, language: string) {
  if (language !== "kk") return ""
  const greeting = kazakhGreeting(text)
  return [
    "Қазақша ауызекі сөйлес. Орыс әріптерімен жазылған қазақша сөздерді мағынасына қарай түсін: «калайсын» = «қалайсың», «жаксы» = «жақсы», «салем» = «сәлем».",
    "«Қалайсың?» — хал сұрау. Оны адамның есімі немесе сөздің анықтамасын сұрау деп қабылдама. Тек пайдаланушы өзі сұраса, сөздің мағынасын түсіндір.",
    "Табиғи сөйлеу үлгісі: «Не істеп жатырсың?» — «Сенімен сөйлесіп отырмын.» «Көмектесесің бе?» — «Әрине, қандай көмек керек?» Септік жалғауларын дұрыс қолдан: «саған», «сені», «сенімен»; «сенге» деп жазба.",
    "Do not invent names or facts to explain an unfamiliar transcript. If intent really is unclear, ask one short question in Kazakh.",
    greeting ? `This utterance is a ${greeting} Kazakh how-are-you greeting addressed to you. Answer naturally, for example: «${kazakhGreetingFallback(greeting)}» Do not define or translate the greeting.` : "",
  ].filter(Boolean).join(" ")
}

export function kazakhGreetingFallback(kind: "casual" | "polite") {
  return kind === "polite"
    ? "Жақсымын, рақмет! Өзіңіз қалайсыз?"
    : "Жақсымын, рақмет! Өзің қалайсың?"
}

/** Check only an exact greeting; never intercept a name, quotation or real task. */
export function answersKazakhGreeting(content: string) {
  const value = content.toLowerCase()
  if (/(?:есім[іы]?|әйел|клисн|адамның аты|означает|женское имя|means|woman.s name)/u.test(value)) return false
  return /(?:жақсы|жаман емес|дайын|рақмет|рахмет)/u.test(value)
}
