const IMAGE_COMMAND_PATTERN = /^\s*\/(?:image|img|photo|foto|фото|картинка)(?![\p{L}\p{N}_])/iu
const VIDEO_COMMAND_PATTERN = /^\s*\/(?:video|veo|видео)(?![\p{L}\p{N}_])/iu

const IMAGE_NOUN_PATTERN = /(?:фото(?:графи(?:ю|я|и))?|фотк(?:у|а|и)?|картинк(?:у|а|и)?|изображени(?:е|я|ю)|постер(?:а|у)?|обложк(?:у|а|и)?|аватар(?:ку|а)?|иллюстраци(?:ю|я|и)|баннер(?:а|у)?|арт(?![\p{L}\p{N}_])|сурет(?:ті|ке|тер)?|image(?:s)?(?![\p{L}\p{N}_])|photo(?:s)?(?![\p{L}\p{N}_])|picture(?:s)?(?![\p{L}\p{N}_])|poster(?:s)?(?![\p{L}\p{N}_])|cover(?:s)?(?![\p{L}\p{N}_])|avatar(?:s)?(?![\p{L}\p{N}_])|illustration(?:s)?(?![\p{L}\p{N}_])|artwork(?:s)?(?![\p{L}\p{N}_])|banner(?:s)?(?![\p{L}\p{N}_]))/iu

// Direct photo intent must survive natural typing/voice mistakes. In particular,
// mobile users often type "сгененируй фото" instead of "сгенерируй фото", and
// "делай фото" is also an explicit creation command. Both must open the real
// confirmation card instead of falling through to the chat model.
const IMAGE_CREATE_VERB_PATTERN = /(?:сген(?:ер|ен)[\p{L}-]*|генерир[\p{L}-]*|созд[\p{L}-]*|сдел[\p{L}-]*|дела(?:й|йте)|нарис[\p{L}-]*|изобраз[\p{L}-]*|рендер[\p{L}-]*|жаса(?:п)?|жасашы|генерацияла[\p{L}-]*|сал(?:ып)?\s+бер|generate(?:d|s|ing)?|create(?:d|s|ing)?|make|draw|render(?:ed|s|ing)?)(?![\p{L}\p{N}_])/iu

const EXPLANATION_START_PATTERN = /^\s*(?:как|почему|зачем|что\s+такое|объясни(?:те)?|расскажи(?:те)?|покажи(?:те)?\s+как|инструкци[яию]|гайд|how\s+to|why|what\s+is|explain|tell\s+me\s+how|do\s+you\s+know\s+how)(?![\p{L}\p{N}_])/iu
const EXPLANATION_BEFORE_CREATE_PATTERN = /(?:объясн[\p{L}-]*|расскаж[\p{L}-]*|покаж[\p{L}-]*\s+как|как\s+)(?:.{0,90}?)(?:сген|генерир|созд|сдел|дела(?:й|йте)|нарис|generate|create|draw|render)/iu

const NON_IMAGE_OBJECT_PATTERN = /(?:код(?:а|ом)?|промпт(?:а|ом)?|prompt|текст(?:а|ом)?|пост(?:а|ом)?(?!ер)|стать[яию]|описани[еяю]|интерфейс(?:а|ом)?|анимаци[яию]|лоадер(?:а|ом)?|loader|кнопк(?:у|а|и)|раздел(?:а|ом)?|функци[яию]|сайт(?:а|ом)?|website|компонент(?:а|ом)?|api|html|css|javascript|typescript|react)(?![\p{L}\p{N}_])/iu
const META_TASK_PREFIX_PATTERN = /^\s*(?:напиши(?:те)?|дай(?:те)?|подготовь(?:те)?|составь(?:те)?|write|give\s+me|prepare)(?![\p{L}\p{N}_])/iu

function firstMatch(value: string, pattern: RegExp) {
  const match = pattern.exec(value)
  return match ? { index: match.index, text: match[0] } : null
}

/**
 * Seeing existing public photos is a chat/reference lookup, NEVER image generation.
 * The explicit visual wording also covers short natural place queries such as
 * "покажи мне Медеу Алматы", without turning "покажи код/решение" into photo search.
 * Shared by chat routing and the rendered gallery to prevent split-brain intent.
 */
export function isReferencePhotoFollowUp(input: string): boolean {
  const text = input.toLowerCase().trim()
  if (!/(?:фото|фотк|картин|изображен|сурет|photos?|pictures?|images?|покажи\s+их|show\s+them)/iu.test(text)) return false
  const rest = text.replace(/(?<![\p{L}\p{N}_])(?:фото(?:графи[\p{L}]*)?|фотк[\p{L}]*|картинк[\p{L}]*|изображени[\p{L}]*|сурет[\p{L}]*|photos?|pictures?|images?|покажи|покажите|добавь|дай|скинь|көрсет(?:ші|іңіз)?|show|add|give|please|пожалуйста|теперь|всех|все|каждого|их|этих|эти|мне|нам|по|на|the|them|all|each|of|me|а)(?![\p{L}\p{N}_])/giu, "").replace(/[\s,.!?…:;-]/gu, "")
  return !rest
}

export function isReferenceImageRequest(input: string): boolean {
  const text = String(input || "").trim()
  if (!text || text.length > 2500) return false
  if (/(?:без\s+(?:фото|картинок|изображений)|не\s+(?:показывай|добавляй|нужны)\s+(?:фото|картинки|изображения)|только\s+текст|no\s+(?:photos?|images?|pictures?)|text\s+only|суретсіз)/iu.test(text)) return false
  if (/^\s*\/(?:image|img|photo|foto|фото|картинка|video|veo|видео)(?![\p{L}\p{N}_])/iu.test(text)) return false
  if (isExplicitImageGenerationRequest(text)) return false
  if (isReferencePhotoFollowUp(text)) return true
  if (/^(?:напиши|создай|write|create)\s+(?:код|функци[\p{L}]*|скрипт|code|function|script)(?=\s|$)/iu.test(text)) return false
  if (/^(?:добавь|дай)(?:\s+мне)?\s+(?:их\s+)?(?:фото(?:графии)?|картинки|изображения)[.!?\s]*$/iu.test(text)) return true

  const request = /^(?:покажи(?:те)?|көрсет(?:ші|іңіз)?|show(?:\s+me)?|find(?:\s+me)?)(?:\s+мне)?\s+(.+)$/iu.exec(text)
  // "Покажи мне как изменить фото" is a tutorial, not a photo request.
  const nonVisual = /^(?:как|почему|зачем|что|код|пример\s+кода|текст|решени[ея]|инструкци[юя]|список|таблиц[уая]|формул[уая]|ошибк[уиа]|настройк[уиа]|доказательств[\p{L}]*|лог[иов]*|результат[\p{L}]*|ответ[\p{L}]*|истори[\p{L}]*|расч[её]т[\p{L}]*|how|why|what|code|steps?|list|table|solution|instructions?|proof|logs?|results?|answer|history|calculation)(?=\s|[?!.]|$)/iu
  if (request && /^(?:как\s+выглядит|how\s+.+\s+looks?)(?=\s|$)/iu.test(request[1].trim())) return true
  if (request && nonVisual.test(request[1].trim())) return false
  if (request && /^(?:возможност[\p{L}]*|стоимост[\p{L}]*|цен[\p{L}]*|тариф[\p{L}]*|рецепт[\p{L}]*|переписк[\p{L}]*|задач[\p{L}]*|чат[\p{L}]*|features?|pricing|prices?|recipes?|tasks?|chats?)(?=\s|$)/iu.test(request[1].trim())) return false
  const show = /(?:\bshow\b|\bfind\b|\bsee\b|покаж[иьте]+|найд[иьте]+|подбер[иьте]+|дай|скинь|көрсет|көрсөт|көрсетші|суреттерін?\s+көрсет)/iu
  const visual = /(?:фото(?:графи[\p{L}]*)?|фотк[\p{L}]*|снимк[\p{L}]*|картинк[\p{L}]*|изображени[\p{L}]*|иллюстраци[\p{L}]*|референс[\p{L}]*|сурет[\p{L}]*|photograph[\p{L}]*|photos?|pictures?|images?|visual[\p{L}]*|references?)/iu
  if (EXPLANATION_START_PATTERN.test(text) && !/^(?:как\s+выглядит|what\s+does\s+.+\s+look\s+like|қандай\s+көрінеді)/iu.test(text)
    && !/(?:с|with)\s+(?:фото|картинк|изображен|сурет|images?|photos?|pictures?)/iu.test(text)) return false
  if (visual.test(text) && (show.test(text) || /(?:\bwith\b|с)\s+(?:фото|картинк|изображен|сурет|images?|photos?|pictures?)/iu.test(text))) return true
  if (/^(?:как\s+выглядит|what\s+does\s+.+\s+look\s+like|қандай\s+көрінеді)/iu.test(text)) return true

  if (!request) return false
  const subject = request[1].trim()
  if (subject.length < 3 || subject.length > 150) return false
  // Teaching, code and document requests should stay ordinary text answers.
  const physicalSubject = /(?:iphone|айфон|samsung|самсунг|galaxy|телефон|медеу|шымбулак|алмат[\p{L}]*|астан[\p{L}]*|архитектур|гор(?:ы|а|ные)|тау|озер|озёр|каньон|здани|пейзаж|автомоб|машин|кот(?:а|ы|ик)?(?![\p{L}])|собак|цвет(?:ок|ы)|птиц|дом(?:а|ов)?(?![\p{L}])|интерьер|одежд|mountains?|lake|architecture|landmarks?|landscape|cars?|cats?|dogs?|sunset|interior|flowers?|Medeu|Almaty|Astana)/iu
  return !nonVisual.test(subject) && (physicalSubject.test(subject) || /\p{Lu}\p{L}{2,}/u.test(subject))
}

/** Uploaded pixels are required for edits; image analysis remains a chat turn. */
export function isExplicitImageEditRequest(input: string, hasImage = false): boolean {
  const text = String(input || "").replace(IMAGE_COMMAND_PATTERN, "").trim()
  if (!text || VIDEO_COMMAND_PATTERN.test(text) || EXPLANATION_START_PATTERN.test(text)) return false
  if (!hasImage && isReferenceImageRequest(input)) return false

  // A text-to-image request may legitimately contain edit-like words such as
  // "надпись", "снизу", "добавь" or "сделай фон". Without uploaded pixels it
  // must stay CREATE, otherwise prompts like "сгенерируй фото ... внизу
  // надпись" are misrouted into the edit pipeline and fail with
  // IMAGE_EDIT_SOURCE_REQUIRED.
  if (!hasImage && isExplicitImageGenerationRequest(input)) return false

  if (!hasImage && !IMAGE_NOUN_PATTERN.test(text)) return false
  if (/^\s*(?:напиши|write|добавь|измени|исправь)\s+(?:мне\s+)?(?:код|промпт|prompt|code|функцию|скрипт)(?![\p{L}\p{N}_])/iu.test(text)) return false
  const edit = /(?:измени|изменить|поменяй|меняй|смени|сменить|замени|заменить|убери|убрать|удали|удалить|добавь|добавить|поставь|поставить|вставь|вставить|размести|разместить|перемести|переместить|дорисуй|дорисовать|отредактируй|редактируй|перекрась|ретушируй|улучши|осветли|затемни|обрежь|вырежи|edit|change|modify|replace|remove|erase|add|insert|place|move|retouch|recolor|crop|өзгерт|ауыстыр|алып\s+таста|қос|енгіз|өшір)(?![\p{L}\p{N}_])/iu
  const lettering = /(?:напиши|нанеси|подпиши|надпись|write|put\s+text|жаз)(?![\p{L}\p{N}_])/iu
  const onImage = /(?:фото|фотк|изображени|картинк|сурет|image|photo|здесь|тут|сюда|сверху|снизу|на\s+(?:нём|нем|ней))/iu
  const visualObject = /(?:фон|цвет|волос|одежд|логотип|лого(?![\p{L}\p{N}_])|эмблем|герб|значок|бренд|background|color|logo|badge|crest|brand|brighter|darker)/iu
  const transform = /(?:сделай|сделать|пусть|make)\s+.{0,80}(?:фон|цвет|волос|одежд|логотип|лого(?![\p{L}\p{N}_])|эмблем|герб|значок|бренд|background|color|logo|badge|crest|brand|brighter|darker)/iu
  const contextualTransform = hasImage && /(?:сделай|сделать|пусть|хочу|make)(?![\p{L}\p{N}_])/iu.test(text) && visualObject.test(text)
  return edit.test(text) || transform.test(text) || contextualTransform || (lettering.test(text) && onImage.test(text))
    || (hasImage && isExplicitImageGenerationRequest(input))
}

/**
 * Returns true only when the user is explicitly asking Malik AI to CREATE an
 * image. Mentioning photos, asking how image generation works, requesting code
 * for an image generator, or discussing an image does not count.
 *
 * This deliberately stays conservative because a false positive launches a
 * real media-generation job. Russian, Kazakh and English request phrasing is
 * supported.
 */
export function isExplicitImageGenerationRequest(input: string): boolean {
  const text = String(input || "").trim()
  if (!text) return false

  if (VIDEO_COMMAND_PATTERN.test(text)) return false
  if (IMAGE_COMMAND_PATTERN.test(text)) return true

  if (EXPLANATION_START_PATTERN.test(text) || EXPLANATION_BEFORE_CREATE_PATTERN.test(text)) {
    return false
  }

  const verb = firstMatch(text, IMAGE_CREATE_VERB_PATTERN)
  const noun = firstMatch(text, IMAGE_NOUN_PATTERN)
  if (!verb || !noun) return false

  const nonImageObject = firstMatch(text, NON_IMAGE_OBJECT_PATTERN)
  if (nonImageObject) {
    // "создай код для генерации фото" / "сделай пост про фото" must stay chat.
    if (nonImageObject.index > verb.index && nonImageObject.index < noun.index) return false

    // "напиши промпт, чтобы сгенерировать фото" is also a text request.
    if (nonImageObject.index < verb.index && META_TASK_PREFIX_PATTERN.test(text.slice(0, verb.index))) return false
  }

  return true
}
