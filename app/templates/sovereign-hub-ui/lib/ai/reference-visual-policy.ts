import { isExplicitImageEditRequest, isExplicitImageGenerationRequest, isReferenceImageRequest } from "./image-intent"

export type ReferenceVisualPlan = {
  topic: string
  queries: string[]
  explicit: boolean
  layout: "landscape" | "portrait"
  kind?: "reference" | "tutorial"
  /** Screenshot matches must include a specific UI feature AND app/device. */
  visualTerms?: string[]
  visualDevice?: string[]
}

const NO_VISUAL = /(?:без\s+(?:фото|картинок|изображений)|не\s+(?:показывай|добавляй|нужны)\s+(?:фото|картинки|изображения)|только\s+текст|no\s+(?:photos?|images?|pictures?)|text\s+only|суретсіз)/iu
const FOLLOW_UP = /^(?:(?:а\s+)?(?:теперь\s+)?(?:покажи|добавь|дай)(?:\s+мне)?\s+(?:их\s+)?(?:фото(?:графии)?|картинки|изображения)|(?:show|add)(?:\s+me)?\s+(?:the\s+)?(?:photos?|images?|pictures?)|суреттерін?\s+көрсет)[.!?\s]*$/iu


/**
 * Screenshot guidance is deliberately narrow: no decorative image lookup for
 * arbitrary questions, and no screenshots pretending to be generated answers.
 * The catalogue only returns files whose titles match BOTH the product and UI.
 */
const TUTORIAL_START = /^(?:как\b|где\b|куда\b|помоги\s+(?:мне\s+)?(?:включить|отключить|настроить)|инструкция\b|пошагово\b|настрой\b|включи\b|отключи\b|how\b|where\b|enable\b|disable\b|set\s+up\b|turn\s+on\b|turn\s+off\b|қалай\b)/iu
const DEVICES = [
  { match: /(?:iphone|айфон|айфоне|ios|ipad|айпад)/iu, label: "iPhone", query: "iPhone iOS", terms: ["iphone", "ios", "ipad"] },
  { match: /(?:android|андроид|samsung|самсунг)/iu, label: "Android", query: "Android", terms: ["android", "samsung"] },
  { match: /(?:windows|виндовс|винда)/iu, label: "Windows", query: "Windows", terms: ["windows"] },
  { match: /(?:macos|macbook|макбук)/iu, label: "Mac", query: "macOS", terms: ["macos", "mac os", "macbook"] },
  { match: /(?:telegram|телеграм)/iu, label: "Telegram", query: "Telegram", terms: ["telegram"] },
  { match: /(?:whatsapp|ватсап|уатсап)/iu, label: "WhatsApp", query: "WhatsApp", terms: ["whatsapp"] },
  { match: /(?:instagram|инстаграм)/iu, label: "Instagram", query: "Instagram", terms: ["instagram"] },
  { match: /(?:tiktok|тик.?ток)/iu, label: "TikTok", query: "TikTok", terms: ["tiktok", "tik tok"] },
  { match: /(?:youtube|ютуб)/iu, label: "YouTube", query: "YouTube", terms: ["youtube"] },
]
const INTERFACE_TOPICS = [
  { match: /(?:вибрац|вибрир|тактильн|vibrat|haptic)/iu, label: "Настройки вибрации", query: "Sounds Haptics vibration", alternate: "ringtone haptics", terms: ["vibrat", "haptic", "тактил", "вибрац"] },
  { match: /(?:уведомлен|оповещен|notification|хабарландыру)/iu, label: "Уведомления", query: "notification settings", alternate: "notifications screen", terms: ["notification", "уведомлен"] },
  { match: /(?:wi.?fi|вай.?фай|интернет|wifi)/iu, label: "Wi-Fi", query: "Wi-Fi settings", alternate: "wireless network settings", terms: ["wi-fi", "wifi", "wireless"] },
  { match: /(?:bluetooth|блютуз)/iu, label: "Bluetooth", query: "Bluetooth settings", alternate: "Bluetooth screen", terms: ["bluetooth"] },
  { match: /(?:темн[а-я]*\s+тем|dark\s+mode|night\s+mode)/iu, label: "Тёмная тема", query: "dark mode settings", alternate: "appearance theme settings", terms: ["dark mode", "appearance", "theme"] },
  { match: /(?:приватност|конфиденциальност|privacy|құпиялылық)/iu, label: "Приватность", query: "privacy settings", alternate: "privacy screen", terms: ["privacy", "приватност"] },
  { match: /(?:запис[а-я]*\s+экран|screen\s+record)/iu, label: "Запись экрана", query: "screen recording settings", alternate: "screen record control", terms: ["screen record", "recording"] },
  { match: /(?:рингтон|мелоди[а-я]*\s+звон|ringtone)/iu, label: "Рингтон", query: "ringtone settings", alternate: "ringtone selection", terms: ["ringtone", "ring tone", "рингтон"] },
  { match: /(?:батаре|аккумулятор|battery)/iu, label: "Батарея", query: "battery settings", alternate: "battery screen", terms: ["battery", "батаре"] },
]
function planTutorialVisuals(text: string): ReferenceVisualPlan | null {
  if (!TUTORIAL_START.test(text)) return null
  const device = DEVICES.find((entry) => entry.match.test(text))
  const feature = INTERFACE_TOPICS.find((entry) => entry.match.test(text))
  if (!device || !feature) return null
  return {
    topic: feature.label + " · " + device.label,
    queries: [device.query + " " + feature.query + " settings screenshot", device.query + " " + feature.alternate + " screenshot"],
    explicit: false, layout: "portrait", kind: "tutorial",
    visualTerms: feature.terms, visualDevice: device.terms,
  }
}

const SCIENCE_TOPICS = [
  { match: /(?:солнечн[а-я]*\s+систем|solar\s+system|күн\s+жүйесі)/iu, label: "Солнечная система", query: "solar system diagram" },
  { match: /(?:строени[а-я]*\s+клетк|жасуша(?:ның)?\s+құрылысы|cell\s+structure)/iu, label: "Строение клетки", query: "cell anatomy diagram" },
  { match: /(?:строени[а-я]*\s+сердц|heart\s+anatomy)/iu, label: "Строение сердца", query: "human heart anatomy diagram" },
  { match: /(?:днк|dna\s+structure|структур[а-я]*\s+dna)/iu, label: "Строение ДНК", query: "DNA double helix diagram" },
  { match: /(?:круговорот[а-я]*\s+вод|water\s+cycle)/iu, label: "Круговорот воды", query: "water cycle diagram" },
  { match: /(?:фотосинтез|photosynthesis)/iu, label: "Фотосинтез", query: "photosynthesis diagram" },
]
function planEducationalVisuals(text: string): ReferenceVisualPlan | null {
  if (!/^(?:объясни(?:те)?|расскажи(?:те)?|что\s+такое|как\s+устроен[ао]?|explain|what\s+is|tell\s+me\s+about|түсіндір)/iu.test(text)) return null
  const subject = SCIENCE_TOPICS.find((entry) => entry.match.test(text))
  return subject ? { topic: subject.label, queries: [subject.query, subject.label], explicit: false, layout: "landscape", kind: "reference" } : null
}

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
  const tutorial = planTutorialVisuals(text)
  if (tutorial) return tutorial
  let explicit = isReferenceImageRequest(text)
  let subject = text
  if (FOLLOW_UP.test(text)) {
    if (!previousQuestion || NO_VISUAL.test(previousQuestion)) return null
    subject = previousQuestion
    explicit = true
  } else if (isExplicitImageEditRequest(text, false)) return null
  if (!explicit) {
    const educational = planEducationalVisuals(text)
    if (educational) return educational
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
