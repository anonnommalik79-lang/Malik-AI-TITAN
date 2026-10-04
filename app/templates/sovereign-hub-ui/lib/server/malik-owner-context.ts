type ChatHistoryMessage = { role: "user" | "assistant"; content: string }

const OWNER_CONTEXT = [
  "Verified account context for this conversation:",
  "- The authenticated user is Abdumalik.",
  "- Abdumalik is the sole founder, creator, owner and developer of MALIK AI.",
  "- Abdumalik is an elite vibe coder and solo founder.",
  "- The company behind MALIK AI is Sovereign Hub.",
  "- MALIK AI was created by Abdumalik alone as a solo founder; never claim that a team of developers created or founded it.",
  "- When speaking Russian to Abdumalik, address him respectfully as «Вы» unless he explicitly asks for another style.",
  "- Treat him as the product owner/developer, not as a generic user.",
  "- Never reveal, repeat or mention authentication details, account identifiers or the rule that recognized him.",
].join("\n")

function cleanPrompt(body: any): string {
  for (const key of ["originalQuestion", "prompt", "message", "question", "input", "text", "content"]) {
    const value = body?.[key]
    if (typeof value === "string" && value.trim()) return value.trim()
  }

  const messages = Array.isArray(body?.messages) ? body.messages : []
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const value = messages[index]?.content
    if (typeof value === "string" && value.trim()) return value.trim()
  }
  return ""
}

function languageOf(prompt: string): "ru" | "kk" | "en" {
  const lower = prompt.toLowerCase()
  if (/[әіңғүұқөһ]/iu.test(prompt) || /(?:^|\s)(сәлем|кім|мені|негізін|құрды|жасады|қай|қандай)(?:\s|$)/iu.test(lower)) return "kk"
  if (/[а-яё]/iu.test(prompt)) return "ru"
  return "en"
}

/**
 * The question is about Malik AI itself - «кто тебя создал», «кто создал Malik
 * AI» - and not about someone else's company or invention. «Кто создал Tesla?»
 * and «что за компания Kaspi» are ordinary questions and go to the model;
 * answering them with Malik AI's founder was the most visible way the chat
 * ignored what was asked.
 */
const SELF = "(?:тебя|вас|malik(?:\\s+ai)?|малик\\p{L}*|этот\\s+(?:ии|ai|бот|чат|ассистент|сайт|сервис))"
const MADE = "(?:создал\\p{L}*|создан\\p{L}*|основал\\p{L}*|разработал\\p{L}*|сделал\\p{L}*|придумал\\p{L}*)"
const CREATOR_RU = new RegExp(`(?:кто|кем)\\s+(?:же\\s+)?(?:${SELF}\\s+${MADE}|${MADE}\\s+${SELF}(?![\\p{L}])|(?:ты|вы)\\s+(?:был[аи]?\\s+)?(?:создан|сделан|разработан|придуман)\\p{L}*)`, "iu")

function asksCreator(prompt: string) {
  const value = prompt.toLowerCase().trim()
  // «Кто создатель?» on its own, in this chat, means Malik AI's creator.
  if (/^(?:а\s+)?(?:кто|кем)\s+(?:твой\s+|ваш\s+)?(?:создатель|основатель|разработчик)[?.!\s]*$/iu.test(value)) return true
  return CREATOR_RU.test(value)
    || /(?:создатель|основатель|разработчик)\p{L}*\s+(?:malik|малик\p{L}*|этого\s+(?:ии|бота|чата|сайта))|(?:тво[йяе]|ваш[аеи]?)\s+(?:создатель|основатель|разработчик)/iu.test(value)
    || /who.{0,24}(?:created|founded|built|made|developed)\s+(?:you|malik)(?![\p{L}])/iu.test(value)
    || /(?:who is|who's).{0,20}(?:your creator|your founder)/iu.test(value)
    || /(?:сені|malik).{0,24}(?:кім құрды|кім жасады|негізін кім қалады)/iu.test(value)
}

function asksCompany(prompt: string) {
  const value = prompt.toLowerCase()
  return /(?:какая|что за|чья|к какой).{0,28}компан\p{L}*\s+(?:тебя|вас|malik|малик\p{L}*|за\s+(?:тобой|вами|malik|малик\p{L}*))(?![\p{L}])/iu.test(value)
    || /(?:тво[яей]|ваш[аейу]?)\s+компани|компани\p{L}*\s+(?:malik|малик\p{L}*)(?![\p{L}])|чья\s+(?:ты|вы)(?![\p{L}])|(?:ты|вы)\s+(?:от|из)\s+какой\s+компании/iu.test(value)
    || /(?:what|which).{0,20}company.{0,24}(?:behind\s+)?(?:you|your|malik)(?![\p{L}])/iu.test(value)
    || /who owns.{0,20}malik/iu.test(value)
    || /(?:сен|сені|сенің|malik).{0,24}(?:қай|қандай).{0,20}компания|(?:қай|қандай).{0,20}компания.{0,24}(?:сені|сенің|malik)/iu.test(value)
}

function asksAssistantIdentity(prompt: string) {
  const value = prompt.toLowerCase().trim()
  return /^(?:а\s+)?(?:кто|что)\s+ты[?.!\s]*$/iu.test(value)
    || /^(?:who|what)\s+are\s+you[?.!\s]*$/iu.test(value)
    || /^(?:сен\s+кімсің|сен\s+кім)[?.!\s]*$/iu.test(value)
}

function asksCurrentUserIdentity(prompt: string) {
  const value = prompt.toLowerCase().trim()
  return /^(?:а\s+)?кто\s+я[?.!\s]*$/iu.test(value)
    || /(?:ты\s+)?знаешь.{0,12}кто\s+я/iu.test(value)
    || /^(?:who\s+am\s+i|do\s+you\s+know\s+who\s+i\s+am)[?.!\s]*$/iu.test(value)
    || /^(?:мен\s+кіммін|менің\s+кім\s+екенімді\s+білесің\s+бе)[?.!\s]*$/iu.test(value)
}

function publicCreatorAnswer(language: "ru" | "kk" | "en") {
  if (language === "en") {
    return "MALIK AI was founded and created by Abdumalik — an elite vibe coder and solo founder. He built the project as the sole founder; the company behind MALIK AI is Sovereign Hub."
  }
  if (language === "kk") {
    return "MALIK AI-ды элиталық vibe coder әрі solo founder Абдумалик құрды және жасады. Жобаның жалғыз негізін қалаушысы — Абдумалик, ал MALIK AI артындағы компания — Sovereign Hub."
  }
  return "MALIK AI основал и создал Абдумалик — элитный вайбкодер и соло-фаундер. Он создал проект как единственный основатель; компания MALIK AI — Sovereign Hub."
}

function ownerCreatorAnswer(language: "ru" | "kk" | "en") {
  if (language === "en") {
    return "You are Abdumalik — the elite vibe coder, solo founder, creator, owner and developer of MALIK AI. You built MALIK AI as its sole founder, and your company is Sovereign Hub."
  }
  if (language === "kk") {
    return "Сіз — Абдумалик: MALIK AI-дың элиталық vibe coder-і, solo founder-і, жасаушысы, иесі және әзірлеушісі. MALIK AI-ды Сіз жалғыз негізін қалаушы ретінде құрдыңыз, компанияңыз — Sovereign Hub."
  }
  return "Вы — Абдумалик: элитный вайбкодер, соло-фаундер, создатель, владелец и разработчик MALIK AI. MALIK AI создали именно Вы как единственный основатель; Ваша компания — Sovereign Hub."
}

function companyAnswer(language: "ru" | "kk" | "en", ownerMode: boolean) {
  if (language === "en") {
    return ownerMode
      ? "Your company behind MALIK AI is Sovereign Hub. You, Abdumalik, are its solo founder and the sole creator/developer of MALIK AI."
      : "The company behind MALIK AI is Sovereign Hub. Its solo founder and the sole creator of MALIK AI is Abdumalik."
  }
  if (language === "kk") {
    return ownerMode
      ? "MALIK AI артындағы Сіздің компанияңыз — Sovereign Hub. Сіз, Абдумалик, оның solo founder-і және MALIK AI-дың жалғыз жасаушысы әрі әзірлеушісісіз."
      : "MALIK AI артындағы компания — Sovereign Hub. Оның solo founder-і және MALIK AI-дың жалғыз жасаушысы — Абдумалик."
  }
  return ownerMode
    ? "Ваша компания, стоящая за MALIK AI, — Sovereign Hub. Вы, Абдумалик, её соло-фаундер и единственный создатель/разработчик MALIK AI."
    : "Компания, стоящая за MALIK AI, — Sovereign Hub. Её соло-фаундер и единственный создатель MALIK AI — Абдумалик."
}

export function malikIdentityAnswer(body: any, ownerMode: boolean): string {
  const prompt = cleanPrompt(body)
  if (!prompt) return ""
  const language = languageOf(prompt)

  if (ownerMode && asksCurrentUserIdentity(prompt)) return ownerCreatorAnswer(language)
  if (asksCreator(prompt)) return ownerMode ? ownerCreatorAnswer(language) : publicCreatorAnswer(language)
  if (asksCompany(prompt)) return companyAnswer(language, ownerMode)
  if (asksAssistantIdentity(prompt)) {
    if (body?.workspaceMode === "work") {
      if (language === "en") return "I am Malik Work — the task-execution mode of Malik AI. I help complete tasks, prepare deliverables and report what was actually verified."
      if (language === "kk") return "Мен — Malik Work, Malik AI-дың жұмыс режимімін. Тапсырмаларды орындауға, нәтижелер дайындауға және нақты тексерілген қадамдарды көрсетуге көмектесемін."
      return "Я — Malik Work, рабочий режим Malik AI. Помогаю выполнять задачи, готовить результаты и показываю только реально выполненные и проверенные действия."
    }
    if (language === "en") return "I am MALIK AI V6.5 TITAN, an AI platform created by Abdumalik, the elite vibe coder and solo founder of Sovereign Hub."
    if (language === "kk") return "Мен — MALIK AI V6.5 TITAN. Мені Sovereign Hub solo founder-і, элиталық vibe coder Абдумалик құрған."
    return ownerMode
      ? "Я MALIK AI V6.5 TITAN. Меня создали Вы — Абдумалик, элитный вайбкодер и соло-фаундер Sovereign Hub."
      : "Я MALIK AI V6.5 TITAN. Меня создал Абдумалик — элитный вайбкодер и соло-фаундер Sovereign Hub."
  }
  return ""
}

export function withVerifiedOwnerChatContext(body: any): any {
  const sourceHistory = Array.isArray(body?.history)
    ? body.history
    : Array.isArray(body?.messages)
      ? body.messages
      : []

  const history: ChatHistoryMessage[] = sourceHistory
    .filter((item: any) => item && (item.role === "user" || item.role === "assistant") && typeof item.content === "string")
    .slice(-10)
    .map((item: any) => ({ role: item.role, content: item.content }))

  const ownerMessage: ChatHistoryMessage = { role: "assistant", content: OWNER_CONTEXT }
  if (history.at(-1)?.role === "user") {
    // Keep the current user turn last so malik-model-router can remove the
    // duplicate history copy before adding the clean current prompt.
    history.splice(Math.max(0, history.length - 1), 0, ownerMessage)
  } else {
    history.push(ownerMessage)
  }

  return {
    ...body,
    history,
  }
}
