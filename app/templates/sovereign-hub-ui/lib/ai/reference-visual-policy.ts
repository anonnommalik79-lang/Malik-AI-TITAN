import { isExplicitImageEditRequest, isExplicitImageGenerationRequest, isReferenceImageRequest } from "./image-intent"

export type ReferenceVisualPlan = {
  topic: string
  queries: string[]
  explicit: boolean
  layout: "landscape" | "portrait"
}

const NO_VISUAL = /(?:без\s+(?:фото|картинок|изображений)|не\s+(?:показывай|добавляй|нужны)\s+(?:фото|картинки|изображения)|только\s+текст|no\s+(?:photos?|images?|pictures?)|text\s+only|суретсіз)/iu
const FOLLOW_UP = /^(?:(?:а\s+)?(?:теперь\s+)?(?:покажи|добавь|дай)(?:\s+мне)?\s+(?:их\s+)?(?:фото(?:графии)?|картинки|изображения)|(?:show|add)(?:\s+me)?\s+(?:the\s+)?(?:photos?|images?|pictures?)|суреттерін?\s+көрсет)[.!?\s]*$/iu

/** Strip instructions; catalogues must receive a subject rather than the answer. */
export function referenceTopic(input: string): string {
  return input.split(/[.!?\n]/u, 1)[0]
    .replace(/\p{Cc}/gu, " ")
    .replace(/^\s*(?:покажи(?:те)?|найди(?:те)?|подбери(?:те)?|дай|скинь|show(?:\s+me)?|find(?:\s+me)?|көрсет(?:ші|іңіз)?)(?:\s+мне)?\s*/iu, "")
    .replace(/^\s*(?:(?:три|несколько|\d+)\s+)?(?:фото(?:графи[\p{L}]*)?|фотк[\p{L}]*|картинк[\p{L}]*|изображени[\p{L}]*|визуальн[\p{L}]*\s+референс[\p{L}]*|референс[\p{L}]*|images?|photos?|pictures?)\s*/iu, "")
    .replace(/^\s*(?:расскажи(?:те)?(?:\s+мне)?(?:\s+(?:о|об|про))?|tell\s+me\s+about|как\s+выглядит|what\s+does)\s*/iu, "")
    .replace(/^\s*(?:of|про|о|об)\s+/iu, "")
    .replace(/\s+(?:look\s+like|с\s+(?:визуальн[\p{L}]*\s+)?референс[\p{L}]*|с\s+(?:картинк[\p{L}]*|фото(?:графи[\p{L}]*)?)|with\s+(?:images|photos|pictures))\s*$/giu, "")
    .replace(/["«»]/g, "").replace(/\s+/g, " ").trim().slice(0, 110)
}

/** Common RU/KZ subjects are translated without another paid model call. */
export function referenceSearchTopic(topic: string): string {
  return topic
    .replace(/больш[\p{L}]*\s+алматинск[\p{L}]*\s+озер[\p{L}]*/giu, "Big Almaty Lake")
    .replace(/заилийск[\p{L}]*\s+алатау/giu, "Trans-Ili Alatau")
    .replace(/медеу/giu, "Medeu").replace(/шымбулак|чимбулак/giu, "Shymbulak")
    .replace(/алмат[\p{L}]*/giu, "Almaty").replace(/астан[\p{L}]*/giu, "Astana")
    .replace(/архитектур[\p{L}]*/giu, "architecture")
    .replace(/(?<![\p{L}])гор(?:ы|а|ные|ный|ных|ами|ах)?(?![\p{L}])/giu, "mountains")
    .replace(/(?<![\p{L}])тау(?:лары|ларын|лар|дың)?(?![\p{L}])/giu, "mountains")
    .replace(/достопримечательност[\p{L}]*/giu, "landmarks")
    .replace(/оз[её]р[\p{L}]*/giu, "lake").replace(/каньон[\p{L}]*/giu, "canyon")
    .replace(/чарынск[\p{L}]*|чарын/giu, "Charyn")
    .replace(/\s+/g, " ").trim()
}

/** Conservative relevance policy: visuals serve the request, not decoration. */
export function planReferenceVisuals(question: string, previousQuestion = "", hasAttachment = false): ReferenceVisualPlan | null {
  const text = String(question || "").trim()
  if (!text || text.length > 2500 || hasAttachment || NO_VISUAL.test(text)) return null
  if (/^\//u.test(text) || isExplicitImageGenerationRequest(text)) return null
  let explicit = isReferenceImageRequest(text)
  let subject = text
  if (FOLLOW_UP.test(text)) {
    if (!previousQuestion || NO_VISUAL.test(previousQuestion)) return null
    subject = previousQuestion
    explicit = true
  } else if (isExplicitImageEditRequest(text, false)) return null
  if (!explicit) {
    // A place itinerary benefits from photos, a bare mention of Almaty does not.
    const places = /^(?:что\s+посмотреть\s+в|куда\s+сходить\s+в|достопримечательности|what\s+to\s+see\s+in|places\s+to\s+visit\s+in)\s+(.+)$/iu.exec(text)
    if (!places) return null
    subject = places[1]
  }
  const topic = referenceTopic(subject)
  if (topic.length < 3 || /^(?:фото|картинки|изображения|photos?|images?|pictures?|код|code|формул[\p{L}]*|решени[\p{L}]*|текст|text|как|how|доказательств[\p{L}]*|логи|ошибк[\p{L}]*|расч[её]т[\p{L}]*)(?=\s|$)/iu.test(topic)) return null
  const translated = referenceSearchTopic(topic)
  const queries = [...new Set([translated, topic])].filter(Boolean).slice(0, 2)
  return { topic, queries, explicit, layout: /референс|вдохнов|бренд|постер|reference|inspiration|poster|brand/iu.test(text) ? "portrait" : "landscape" }
}
