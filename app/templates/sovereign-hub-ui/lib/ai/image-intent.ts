const IMAGE_COMMAND_PATTERN = /^\s*\/(?:image|img|photo|foto|фото|картинка)(?![\p{L}\p{N}_])/iu
const VIDEO_COMMAND_PATTERN = /^\s*\/(?:video|veo|видео)(?![\p{L}\p{N}_])/iu

const IMAGE_NOUN_PATTERN = /(?:фото(?:графи(?:ю|я|и))?|фотк(?:у|а|и)?|картинк(?:у|а|и)?|изображени(?:е|я|ю)|постер(?:а|у)?|обложк(?:у|а|и)?|аватар(?:ку|а)?|иллюстраци(?:ю|я|и)|баннер(?:а|у)?|арт(?![\p{L}\p{N}_])|сурет(?:ті|ке|тер)?|image(?:s)?(?![\p{L}\p{N}_])|photo(?:s)?(?![\p{L}\p{N}_])|picture(?:s)?(?![\p{L}\p{N}_])|poster(?:s)?(?![\p{L}\p{N}_])|cover(?:s)?(?![\p{L}\p{N}_])|avatar(?:s)?(?![\p{L}\p{N}_])|illustration(?:s)?(?![\p{L}\p{N}_])|artwork(?:s)?(?![\p{L}\p{N}_])|banner(?:s)?(?![\p{L}\p{N}_]))/iu

const IMAGE_CREATE_VERB_PATTERN = /(?:сгенер[\p{L}-]*|генерир[\p{L}-]*|созд[\p{L}-]*|сдел[\p{L}-]*|нарис[\p{L}-]*|изобраз[\p{L}-]*|рендер[\p{L}-]*|жаса(?:п)?|жасашы|генерацияла[\p{L}-]*|сал(?:ып)?\s+бер|generate(?:d|s|ing)?|create(?:d|s|ing)?|make|draw|render(?:ed|s|ing)?)(?![\p{L}\p{N}_])/iu

const EXPLANATION_START_PATTERN = /^\s*(?:как|почему|зачем|что\s+такое|объясни(?:те)?|расскажи(?:те)?|покажи(?:те)?\s+как|инструкци[яию]|гайд|how\s+to|why|what\s+is|explain|tell\s+me\s+how|do\s+you\s+know\s+how)(?![\p{L}\p{N}_])/iu
const EXPLANATION_BEFORE_CREATE_PATTERN = /(?:объясн[\p{L}-]*|расскаж[\p{L}-]*|покаж[\p{L}-]*\s+как|как\s+)(?:.{0,90}?)(?:сгенер|генерир|созд|сдел|нарис|generate|create|draw|render)/iu

const NON_IMAGE_OBJECT_PATTERN = /(?:код(?:а|ом)?|промпт(?:а|ом)?|prompt|текст(?:а|ом)?|пост(?:а|ом)?(?!ер)|стать[яию]|описани[еяю]|интерфейс(?:а|ом)?|анимаци[яию]|лоадер(?:а|ом)?|loader|кнопк(?:у|а|и)|раздел(?:а|ом)?|функци[яию]|сайт(?:а|ом)?|website|компонент(?:а|ом)?|api|html|css|javascript|typescript|react)(?![\p{L}\p{N}_])/iu
const META_TASK_PREFIX_PATTERN = /^\s*(?:напиши(?:те)?|дай(?:те)?|подготовь(?:те)?|составь(?:те)?|write|give\s+me|prepare)(?![\p{L}\p{N}_])/iu

function firstMatch(value: string, pattern: RegExp) {
  const match = pattern.exec(value)
  return match ? { index: match.index, text: match[0] } : null
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
