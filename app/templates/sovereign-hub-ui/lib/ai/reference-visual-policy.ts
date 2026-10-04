import { isExplicitImageEditRequest, isExplicitImageGenerationRequest, isReferenceImageRequest, isReferencePhotoFollowUp } from "./image-intent"
import { APPLE_IPHONE_PHOTOS, namedIPhoneSubjects, normalizeIPhoneSubject } from "../media/official-product-photos"
import { canonicalPortraitTopic } from "../media/verified-portraits"

export type ReferenceVisualPlan = {
  topic: string
  queries: string[]
  explicit: boolean
  layout: "landscape" | "portrait"
  kind?: "reference" | "tutorial"
  /** Screenshot matches must include a specific UI feature AND app/device. */
  visualTerms?: string[]
  visualDevice?: string[]
  subjects?: string[]
  entity?: boolean
  /** People require a canonical article portrait, never namesake results. */
  person?: boolean
  /** A short line under the photo in a comparison lineup. */
  caption?: string
}

const NO_VISUAL = /(?:без\s+(?:фото|картинок|изображений)|не\s+(?:показывай|добавляй|нужны)\s+(?:фото|картинки|изображения)|только\s+текст|no\s+(?:photos?|images?|pictures?)|text\s+only|суретсіз)/iu


/** Screenshots must match both the product and requested interface feature. */
const TUTORIAL_START = /^(?:(?:как|где|куда|инструкция|пошагово|настрой|включи|отключи|how|where|enable|disable|set\s+up|turn\s+on|turn\s+off|қалай)(?![\p{L}\p{N}_])|помоги\s+(?:мне\s+)?(?:включить|отключить|настроить))/iu
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
  { match: /github/iu, label: "GitHub", query: "GitHub", terms: ["github"] },
  { match: /(?:render|рендер)/iu, label: "Render", query: "Render dashboard", terms: ["render"] },
  { match: /(?:google|гугл|gmail)/iu, label: "Google", query: "Google", terms: ["google", "gmail"] },
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
  if (!device) return null
  if (!feature) {
    const subject = referenceTopic(text).replace(/^(?:как|где|куда|how\s+to|how|where|қалай)\s+/iu, "").slice(0, 90)
    const terms = subject.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((word) => word.length > 4 && !device.terms.includes(word)).slice(0, 4)
    if (!terms.length) return null
    return { topic: subject, queries: [device.query + " " + subject + " screenshot", device.query + " " + subject], explicit: false, layout: "portrait", kind: "tutorial", visualDevice: device.terms, visualTerms: terms }
  }
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
  { match: /(?:строени[а-я]*\s+сердц|heart\s+anatomy)/iu, label: "Строение сердца", query: "heart diagram" },
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
    .replace(/^\s*(?:объясни(?:те)?|опиши(?:те)?|что\s+такое|какие|какой|какая|какое|что|кто\s+(?:такой|такая|такое)|кто|explain|describe|what\s+(?:is|are)|who\s+is|түсіндір|қандай)\s*/iu, "")
    .replace(/^\s*(?:(?:все|всех|весь|all|every)\s+)?(?:модели?|поколения|models?|generations?)\s+/iu, "")
    .replace(/^\s*(?:пр[еи]з[еи]дент|президент|president)\s+/iu, "")
    .replace(/^\s*(?:как|где|куда|how\s+to|where\s+to|қалай)\s+(?:(?:мне|можно|нужно|лучше|do\s+i|can\s+i)\s+)?(?:(?:зайти|войти|попасть|сходить|поехать|сделать|готовить|приготовить|собрать|настроить|выбрать|добраться|посетить|enter|visit|make|cook|build|choose|get\s+to)\s+)?(?:на\s+|в\s+|to\s+|the\s+)?/iu, "")
    .replace(/^\s*(?:приложение|приложении|app|application)\s+/iu, "")
    .replace(/^\s*(?:of|про|о|об)\s+/iu, "")
    .replace(/\s+(?:look\s+like|с\s+(?:визуальн[\p{L}]*\s+)?референс[\p{L}]*|с\s+(?:картинк[\p{L}]*|фото(?:графи[\p{L}]*)?)|with\s+(?:images|photos|pictures))\s*$/giu, "")
    .replace(/["«»]/g, "").replace(/\s+/g, " ").trim().slice(0, 110)
}

/** Common RU/KZ subjects are translated without another paid model call. */
export function referenceSearchTopic(topic: string): string {
  return normalizeIPhoneSubject(canonicalPortraitTopic(topic))
    .replace(/(?:нурсултан[\p{L}]*\s+(?:[\p{L}]+\s+){0,2})?назарбаев[\p{L}]*/giu, "Nursultan Nazarbayev")
    .replace(/больш[\p{L}]*\s+алматинск[\p{L}]*\s+озер[\p{L}]*/giu, "Big Almaty Lake")
    .replace(/заилийск[\p{L}]*\s+алатау/giu, "Trans-Ili Alatau")
    .replace(/медеу/giu, "Medeu").replace(/шымбулак|чимбулак/giu, "Shymbulak")
    .replace(/алмат[\p{L}]*/giu, "Almaty").replace(/астан[\p{L}]*/giu, "Astana")
    .replace(/казахстан[\p{L}]*|қазақстан[\p{L}]*/giu, "Kazakhstan")
    .replace(/тянь[\s-]*шань/giu, "Tian Shan").replace(/хан[\s-]*тенгри/giu, "Khan Tengri")
    .replace(/джунгарск[\p{L}]*\s+алатау/giu, "Dzungarian Alatau").replace(/алтай/giu, "Altai")
    .replace(/архитектур[\p{L}]*/giu, "architecture")
    .replace(/(?<![\p{L}])гор(?:ы|а|ные|ный|ных|ами|ах)?(?![\p{L}])/giu, "mountains")
    .replace(/(?<![\p{L}])тау(?:лары|ларын|лар|дың)?(?![\p{L}])/giu, "mountains")
    .replace(/достопримечательност[\p{L}]*/giu, "landmarks")
    .replace(/оз[её]р[\p{L}]*/giu, "lake").replace(/каньон[\p{L}]*/giu, "canyon")
    .replace(/чарынск[\p{L}]*|чарын/giu, "Charyn")
    .replace(/\s+/g, " ").trim()
}

const TEXT_TASK = /^(?:напиши|перепиши|исправь|улучши|переведи|сократи|сочини|реши|вычисли|посчитай|write|rewrite|translate|calculate|solve|аудар|есепте)(?![\p{L}\p{N}_])/iu
const NON_VISUAL = /^(?:привет|салам|сәлем|спасибо|рахмет|ок|okay|hi|hello|ты\s+кто|кто\s+ты|да|нет|yes|no)[!?\s.]*$/iu
const STRUCTURED_TASK = /(?:чек[ -]?лист|checklist|таблиц|spreadsheet|\btable\b|дв[еу]\s+колонк|two\s+columns|\b(?:python|javascript|typescript|sql)\b|\bкод\b|\bcode\b)/iu

/** A model may name concrete objects in comparisons, but must respect text-only requests. */
export function allowsAnswerPhotoHints(question: string, hasAttachment = false): boolean {
  const text = question.trim()
  return Boolean(text && text.length <= 2500 && !hasAttachment && !NO_VISUAL.test(text) && !NON_VISUAL.test(text)
    && !TEXT_TASK.test(text) && !/^\//u.test(text) && !isExplicitImageGenerationRequest(text)
    && !isExplicitImageEditRequest(text, false) && !planTutorialVisuals(text)
    && !/(?:\b(?:python|javascript|typescript|sql|code)\b|(?<!\p{L})код(?!\p{L})|чек[ -]?лист|checklist)/iu.test(text))
}

/** Evaluate every explanatory answer; never require the user to ask for photos. */
export function planReferenceVisuals(question: string, previousQuestion = "", hasAttachment = false, previousAnswer = ""): ReferenceVisualPlan | null {
  const text = String(question || "").trim()
  if (!text || text.length > 2500 || hasAttachment || NO_VISUAL.test(text)) return null
  if (/^\//u.test(text) || isExplicitImageGenerationRequest(text) || NON_VISUAL.test(text) || TEXT_TASK.test(text)) return null
  if (STRUCTURED_TASK.test(text) && !/(?:фото(?:граф|к)?|картинк|изображени|\bphotos?\b|\bimages?\b|\bpictures?\b|сурет)/iu.test(text)) return null
  const tutorial = planTutorialVisuals(text)
  if (tutorial) return tutorial
  let explicit = isReferenceImageRequest(text)
  let subject = text
  const followUp = isReferencePhotoFollowUp(text)
  if (followUp) {
    if (!previousQuestion) return null
    subject = previousQuestion.replace(NO_VISUAL, "").trim()
    explicit = true
  } else if (isExplicitImageEditRequest(text, false)) return null
  if (!explicit) {
    const educational = planEducationalVisuals(text)
    if (educational) return educational
    // Questions about places, people, objects and concepts get references by default.
    const places = /^(?:что\s+посмотреть\s+в|куда\s+сходить\s+в|достопримечательности|what\s+to\s+see\s+in|places\s+to\s+visit\s+in)\s+(.+)$/iu.exec(text)
    subject = places ? places[1] : text
    if (/^(?:объясни\s+как|почему\s+не\s+работает)/iu.test(text)) return null
    if (/^(?:покажи|show|объясни\s+как|почему\s+не\s+работает)/iu.test(text) && !/(?:iphone|айфон|samsung|самсунг|телефон|гор[а-я]*|тау|озер|город|страна|здани|животн|растени|mountain|lake|city|building)/iu.test(text)) return null
  }
  const topic = referenceTopic(subject)
  if (topic.length < 3 || /^(?:фото|картинки|изображения|photos?|images?|pictures?|код|code|формул[\p{L}]*|решени[\p{L}]*|текст|text|как|how|доказательств[\p{L}]*|логи|ошибк[\p{L}]*|расч[её]т[\p{L}]*)(?=\s|$)/iu.test(topic)) return null
  const translated = referenceSearchTopic(topic)
  const search = translated.replace(/(?<!\p{L})(?:есть|бывают|находятся|расположены|в|на|из|про|о|об|of|in|the|are)(?!\p{L})/giu, " ").replace(/\s+/gu, " ").trim()
  const queries = [...new Set([search || translated, topic])].filter(Boolean).slice(0, 2)
  const listed = followUp ? namedReferenceSubjects(previousAnswer) : []
  const allIPhones = /(?:все|всех|all|every).{0,25}(?:модел|поколен|models?|generations?).{0,15}(?:iphone|айфон)/iu.test(subject)
  const subjects = listed.length ? listed : allIPhones ? Object.keys(APPLE_IPHONE_PHOTOS).reverse() : undefined
  const person = /^(?:кто(?:\s+(?:такой|такая|такое|это))?|who(?:\s+is)?|кім)(?:\s|$)/iu.test(subject)
    || /(?:назарбаев|портрет|portrait|биографи)/iu.test(subject)
  return { topic, queries, explicit, subjects, person, entity: person || /(?:iphone|айфон)/iu.test(subject), layout: person || /референс|вдохнов|бренд|постер|reference|inspiration|poster|brand/iu.test(text) ? "portrait" : "landscape" }
}

export type AnswerVisualSegment = { key: string; text: string; kind: "heading" | "item" | "paragraph" }
export type AnswerVisualSlot = { key: string; plan: ReferenceVisualPlan; row: boolean }
export function visualSegmentLabel(text: string): string {
  const bold = /\*\*([^*]{3,100})\*\*/u.exec(text)?.[1]
  return (bold || text.split(/\s+[—–]\s+|[.!?\n]/u, 1)[0]).replace(/(?:\*\*|__|[`*_])/gu, "").replace(/^\d+[.)]\s*/u, "").trim().slice(0, 100)
}

/** Resolve a photo follow-up from named subjects already present in the answer. */
export function namedReferenceSubjects(answer: string): string[] {
  const text = answer.replace(/```[\s\S]*?(?:```|$)/gu, "")
  const phones = namedIPhoneSubjects(text)
  if (phones.length) return phones
  const names = text.split("\n").flatMap((line) => {
    const match = /^\s*(?:#{1,3}\s+|\d+[.)]\s+|[-*+]\s+)(.+)$/u.exec(line)
    if (!match) return []
    const label = visualSegmentLabel(match[1])
    if (label.length < 3 || label.length > 80 || label.split(/\s+/u).length > 7
      || /^(?:истори[яи]|биографи[яи]|особенности|классическ|эпоха|итог|вывод|совет|важно|заключение|summary|conclusion|tips?|открой|нажми|выбери|проверь|добавь|улучши|создай|сделай|запусти|перейди|введи|как|что|click|tap|open|select|enter|check|create|add|https?:)/iu.test(label)) return []
    return [label]
  })
  return [...new Set(names)].slice(0, 60)
}

/** At most three grounded lookups per answer; anchor them in the actual Markdown. */
export function planAnswerVisualSlots(question: string, segments: AnswerVisualSegment[], previousQuestion = "", hasAttachment = false, previousAnswer = ""): AnswerVisualSlot[] {
  const base = planReferenceVisuals(question, previousQuestion, hasAttachment, previousAnswer)
  if (!base) return []
  const models = namedIPhoneSubjects(segments.map((segment) => segment.text).join("\n"))
  if (base.subjects?.length || models.length > 1) {
    const anchor = segments.find((segment) => segment.kind === "paragraph") || segments[0]
    return anchor ? [{ key: anchor.key, row: false, plan: { ...base, subjects: base.subjects || models } }] : []
  }
  // A name in the opening sentence resolves inflected or surname-only questions.
  // Only treat two or more capitalized name parts as a person, not a place title.
  const intro = segments.find((segment) => segment.kind === "paragraph") || segments[0]
  const introName = intro?.kind === "paragraph" && /\s[—–]\s/u.test(intro.text) ? visualSegmentLabel(intro.text) : ""
  const fullName = /^[\p{Lu}][\p{L}'-]+(?:\s+[\p{Lu}][\p{L}'-]+){1,3}$/u.test(introName)
  if (intro && !base.person && fullName && /^(?:кто|who|расскажи|tell\s+me\s+about|биографи|покажи(?:те)?(?:\s+мне)?\s+(?:фото|портрет))/iu.test(question)) {
    return [{ key: intro.key, row: false, plan: { ...base, topic: introName,
      queries: [...new Set([referenceSearchTopic(introName), introName])].slice(0, 2),
      person: true, entity: true, layout: "portrait" } }]
  }
  if (base.entity) {
    const anchor = segments.find((segment) => segment.kind === "paragraph") || segments[0]
    const named = anchor?.kind === "paragraph" ? visualSegmentLabel(anchor.text) : ""
    const name = named && named.length <= 80 && /\s[—–]\s/u.test(anchor?.text || "") ? named : ""
    return anchor ? [{ key: anchor.key, row: false, plan: name ? { ...base, topic: name, queries: [...new Set([referenceSearchTopic(name), ...base.queries])].slice(0, 2) } : base }] : []
  }
  const candidates = segments.filter((segment) => segment.kind !== "paragraph" && !/^(?:итог|вывод|совет|важно|заключение|summary|conclusion|tips?|что\s+делать|как\s+зайти|куда\s+ехать|если\s+)/iu.test(visualSegmentLabel(segment.text)))
  if (base.kind === "tutorial") {
    // One matched screenshot beside its relevant step, not the same image on every step.
    const anchor = candidates.find((segment) => base.visualTerms?.some((term) => segment.text.toLowerCase().includes(term))) || segments.find((segment) => segment.kind === "paragraph") || candidates[0]
    return anchor ? [{ key: anchor.key, plan: base, row: true }] : []
  }
  const useful = candidates.filter((segment) => {
    const label = visualSegmentLabel(segment.text)
    return label.length > 3 && label.split(/\s+/u).length <= 10 && !/^\d{4}$/u.test(label) && !/^(?:истори[яи]|биографи[яи]|особенности|классическ|эпоха|открой|нажми|выбери|перейди|введи|вернись|click|tap|open|select|enter)/iu.test(label)
  }).slice(0, 3)
  if (useful.length) return useful.map((segment) => {
    const label = visualSegmentLabel(segment.text)
    const topic = referenceTopic(label)
    return { key: segment.key, row: true, plan: { topic, queries: [...new Set([referenceSearchTopic(topic), topic])], explicit: false, layout: "landscape", kind: "reference" } }
  })
  const anchor = segments.find((segment) => segment.kind === "paragraph") || segments[0]
  return anchor ? [{ key: anchor.key, plan: base, row: false }] : []
}
