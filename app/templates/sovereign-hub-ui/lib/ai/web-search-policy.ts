import { asksHeadToHead, asksPurchaseAdvice, asksSubjectOverview } from "@/lib/ai/question-shape"
import { analysisFrame, asksAnalysis } from "@/lib/ai/analysis-shape"
import { needsCurrentEvidence } from "./current-evidence"
import { truthNeedsLiveEvidence } from "./truth-engine"
import { classifyFreshness, NO_WEB } from "./freshness-intent"
import { websiteIntent } from "@/lib/website/engine/intent"
export type WebSearchOptions = {
  research?: boolean
  disableResearch?: boolean
  forceResearch?: boolean
}

/** Pure intent check: no classifier request, keys, or token consumption. */
export function shouldUseWeb(prompt: string, options: WebSearchOptions = {}): boolean {
  const text = prompt.toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim()
  if (!text || options.disableResearch || options.research === false) return false
  if (NO_WEB.test(text)) return false
  // A build brief may contain «современный», «2026» or ask for photos/video.
  // Those are project requirements, not a news-research answer. Any factual
  // content research belongs to a separate project stage.
  if (websiteIntent(prompt)) return false
  if (/(?:не\s+(?:ищи|гугли|загугливай)|без\s+(?:поиска|интернета|гугла)|do not (?:search|browse)|don't (?:search|browse)|without (?:web|search|internet))/i.test(text)) return false

  // An explicit search request always wins.
  if (/(?:по[ий]щ[иь]|поиск\s+(?:в|по)|загугл|гугл[еи]|найди\s+(?:в\s+(?:сети|интернете)|через\s+веб)|проверь\s+(?:онлайн|в\s+сети)|\b(?:google|browse|search the web|look up|search online)\b)/i.test(text)) return true

  // A date inside an explicitly creative brief is a story setting, not a
  // request for current facts. News and explicit research still use evidence.
  if (/^(?:(?:пожалуйста|please)\s+)?(?:(?:напиши|сочини|придумай)\s+(?:стих|сказк|рассказ|песн)|(?:write|compose)\s+(?:(?:a|an)\s+)?(?:story|poem|fairy\s+tale|song|lyrics)\b)/iu.test(text)) {
    return options.forceResearch === true || /(?:источник|исследован|новост|\b(?:sources|research|news|current events)\b)/iu.test(text)
  }

  // "Напиши последние новости" still needs live evidence. A generic writing
  // or API keyword must not bypass checks of releases, prices and availability.
  if (needsCurrentEvidence(text)) return true
  if (truthNeedsLiveEvidence(text)) return true
  // An analyst checks the current numbers before analysing a market, a company, a technology or an event.
  if (asksAnalysis(text) && (["market", "company", "technology", "event"].includes(analysisFrame(text)) || (analysisFrame(text) === "decision" && /бизнес|кофейн|магазин|салон|открыва|открыть|инвест|вклад|акци|крипт|недвиж|business|invest|stock|crypto/iu.test(text)))) return true
  const freshness = classifyFreshness(text)
  if (freshness.category === "STATIC" && !options.forceResearch) return false

  // Coding/writing/calculation requests must stay on the model path even when
  // the dashboard's generic "web & sources" toggle is enabled. This prevents
  // irrelevant sources from bloating model context and breaking free-tier TPM.
  if (/^(?:(?:пожалуйста|можешь|давай)\s+)?(?:переведи|перевод|перепиши|сократи|исправь|напиши|сочини|придумай|создай|сделай|почини|добавь|измени|сверстай|посчитай|реши|найди\s+(?:ошибку|баг|сумму|корень)|translate\b|rewrite\b|summari[sz]e\b|write\b|create\b|build\b|implement\b|fix\b|calculate\b|debug\b)/i.test(text)) return false
  if (/(?:\bhtml\b|\bcss\b|javascript|typescript|python|react|next\.?js|node\.?js|\bsql\b|index\.html|localstorage|код|скрипт|компонент|функц|api\b)/i.test(text)) return false
  if (/(?:кто\s+ты|что\s+ты\s+умеешь|что\s+умеешь|\bwho are you\b|\bwhat can you do\b)/i.test(text)) return false

  if (options.forceResearch) return true

  // Event programmes and participant lists need a live check even without
  // "search", "today" or a question mark in a conversational request.
  if (/(?:спикер[\p{L}]*|участник[\p{L}]*|хедлайнер[\p{L}]*|программ[\p{L}]*|speakers?|participants?|line[ -]?up|programme?|спикерлер|қатысушылар)/iu.test(text)
    && /(?:форум|фестиваль|конференц|выставк|мероприяти|саммит|digital\s+bridge|conference|summit|festival|expo|forum|event)/iu.test(text)) return true

  if (/(?:найди|найти|ищи|ищем|источники|ссылки\s+на|проведи\s+(?:глубокое\s+)?исследование|\b(?:search|sources|research)\b)/i.test(text)) return true
  if (/(?:что\s+такое|кто\s+так(?:ой|ая|ие)|\bwhat (?:is|are)\b|\bwho is\b|деген\s+не)/i.test(text)) return true
  // A whole subject, named contenders or a purchase: ChatGPT looks these up,
  // because roles, versions, prices and rankings change after any model's
  // training data.
  if (asksSubjectOverview(text) || asksHeadToHead(text) || asksPurchaseAdvice(text)) return true

  const changingFact = /(?:погод[ауы]|прогноз\s+погоды|курс\s+(?:валют|доллар|евро|тенге)|цен[ауы]\s+на|сколько\s+стоит|расписани[ея]|последни[ея]\s+(?:новости|версии)|свежие\s+новости|\b(?:weather|exchange rate|stock price|latest news|release date)\b)/i.test(text)
  const currentQuestion = /(?:кто|како[йеяг]|какие|когда|где|сколько|\b(?:who|what|when|where|how much)\b)/i.test(text)
    && /(?:сейчас|сегодня|актуальн|последн|президент|министр|\b(?:current|today|latest|president|ceo)\b)/i.test(text)
  return changingFact || currentQuestion
}
