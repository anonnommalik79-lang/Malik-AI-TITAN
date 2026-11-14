export type FlashTranscriptMessage = {
  id?: string
  role?: string
  content?: string
  timestamp?: string
  isStreaming?: boolean
  attachments?: { id?: string; url?: string; name?: string }[]
  generatedMedia?: { kind?: string; status?: string; id?: string; url?: string }
  answerProvider?: string
}

const ignoredWords = new Set("где как это что когда какой какие какой был были ты мы мне наш про чем для при для уже что this that is are did was were with have about last which what when how your the and for our from you chat earlier please".split(" "))

function terms(value: string) {
  return [...new Set((value.toLowerCase().normalize("NFKC").match(/[\p{L}\p{N}][\p{L}\p{N}_-]{2,}/gu) || [])
    .filter(word => !ignoredWords.has(word))
    .map(word => word.length > 6 ? word.slice(0, 6) : word))]
}

export function flashTranscript(messages: readonly FlashTranscriptMessage[]) {
  return messages.filter(message => message.isStreaming !== true &&
    (message.role === "assistant" || message.role === "user") &&
    typeof message.content === "string" && Boolean(message.content.trim()))
}

export function retrieveFlashMessages(messages: readonly FlashTranscriptMessage[], query: string, limit = 4) {
  const queryTerms = terms(query.slice(0, 6000))
  if (!queryTerms.length) return []
  return flashTranscript(messages).flatMap((message, index) => {
    const words = new Set(terms(message.content!.slice(0, 24_000)))
    const score = queryTerms.reduce((hits, term) => hits + Number(words.has(term)), 0)
    return score ? [{ message, index, score }] : []
  }).sort((a, b) => b.score - a.score || b.index - a.index).slice(0, limit)
    .sort((a, b) => a.index - b.index).map(result => result.message)
}

function excerpt(message: FlashTranscriptMessage, limit: number) {
  const text = message.content!.replace(/\s+/gu, " ").trim()
  return { id: message.id?.slice(0, 64), role: message.role, text: text.length > limit ? text.slice(0, limit - 1) + "…" : text }
}

export function buildFlashContext(messages: readonly FlashTranscriptMessage[], question: string) {
  const transcript = flashTranscript(messages)
  const recent = transcript.slice(-5)
  const earlier = transcript.slice(0, -recent.length)
  const decisions = earlier.filter(message => message.role === "user" &&
    /^(?:решили|выбрали|поправка|исправление|запомни|решение|осталось|we decided|correction|remember|todo)(?!\p{L})/iu.test(message.content!)).slice(-2)
  const relevant = retrieveFlashMessages(earlier, question, 3).filter(message => !decisions.includes(message))
  if (!transcript.length) return undefined
  const context = {
    decisionsAndCorrections: decisions.map(message => excerpt(message, 180)),
    relevantEarlierExcerpts: relevant.map(message => excerpt(message, 220)),
    recentExcerpts: recent.map(message => excerpt(message, 210)),
  }
  let encoded = JSON.stringify(context)
  while (encoded.length > 3600) {
    if (context.recentExcerpts.length) context.recentExcerpts.shift()
    else if (context.relevantEarlierExcerpts.length) context.relevantEarlierExcerpts.shift()
    else context.decisionsAndCorrections.shift()
    encoded = JSON.stringify(context)
  }
  return encoded
}

export function flashHistoryQuery(question: string) {
  return /^(?:найди\s+в\s+(?:этом\s+чате|истории\s+(?:этого\s+)?чата)|search\s+(?:this\s+chat|(?:this\s+)?chat\s+history)\s+for)\s*[:«"\s]*([^»"\n]+?)\s*[»"]?$/iu.exec(question.trim())?.[1]?.trim()
}

export function asksWhichModelGeneratedImage(question: string) {
  const text = question.trim()
  return text.length <= 260 &&
    /(?:^|\s)(?:какая|какой|какую|что за|кто|кем|чем|which|what)(?!\p{L}).{0,90}(?:модел|генератор|движок|провайдер|сгенерир|генерирова|создал|создан|нарисовал|generated|model|generator|made)|(?:картинк|изображени|фото).{0,40}(?:какая модель|какой моделью|кем создан)/iu.test(text) &&
    /(?:фото|картинк|изображени|сгенерир|генерирова|создал|создан|нарисовал|generated|made|image|picture)/iu.test(text)
}

export function flashReceiptTarget<T>(question: string, results: T[]) {
  if (/(?:перв\p{L}*|\bfirst\b)/iu.test(question)) return results[0]
  const index = /(?:номер|№|number|#)\s*(\d{1,3})(?!\d)/iu.exec(question)?.[1]
  return index ? results[Number(index) - 1] : results.at(-1)
}
