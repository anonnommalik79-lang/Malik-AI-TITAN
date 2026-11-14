import { actionableRequest, isSoftwareCreationRequest, primaryNonMediaArtifact } from "./artifact-intent"
import { isExplicitImageEditRequest, isExplicitImageGenerationRequest, isTextOnlyMediaDiscussion } from "./image-intent"

const software = /(?<![\p{L}\p{N}_])(?:software|source\s+code|code\s*base|coding|code|repository|repo|pull\s+request|component|function|backend|front[ -]?end|web\s*app|app(?:lication)?|api|sql|javascript|html|typescript|react|python|npm|docker|stack\s*trace|код\p{L}*|репозитор\p{L}*|бэкенд\p{L}*|фронтенд\p{L}*|приложени[ея]|скрипт\p{L}*|компонент\p{L}*|программ\p{L}*|сборк\p{L}*|деплой\p{L}*)(?![\p{L}\p{N}_])/iu
const action = /(?<!\p{L})(?:build|implement|create|write|develop|debug|fix|patch|refactor|review|audit|test|migrate|deploy|repair|add|сделай|собери|создай|напиши|реализуй|разработай|исправь|почини|перепиши|проверь|протестируй|задеплой|найди\s+(?:баг|ошиб)\p{L}*|жаса\p{L}*|түзет\p{L}*)(?!\p{L})/iu
const discussion = /^(?:что\s+такое|как|почему|зачем|объясни\p{L}*|сравни\p{L}*|расскажи\p{L}*|what\s+(?:is|are)|how\s+(?:does|do|can|to)|why|explain|compare|describe|tell\s+me|қалай|түсіндір)(?!\p{L})/iu
const requestedDocument = /^(?:write|create|make|prepare|напиши|сделай|создай|подготовь)\s+(?:(?:me|мне|an?|the)\s+)*(?:guide|tutorial|article|report|essay|prompt|checklist|instructions?|plan|гайд|статью|отч[её]т|промпт|инструкци\p{L}*|план|описание)(?!\p{L})/iu

export function flashImageOperation(prompt: string, hasImage: boolean): "edit" | "generate" | null {
  const text = prompt.replace(/^\s*\/(?:image|img|photo|foto|фото|картинка)(?![\p{L}\p{N}_])\s*:?\s*/iu, "").trim()
  const create = /^(?:(?:please|пожалуйста)\s+)?(?:create|generate|draw|сгенерируй|нарисуй)\s+(?:(?:me|an?|the|мне)\s+)*(?:new\s+|нов\p{L}*\s+)?(?:image|photo|picture|artwork|render|снимок|картинк\p{L}*|фото|изображени\p{L}*)(?!\p{L})/iu
  const editReference = /\b(?:based on|from)\s+(?:this|the attached|uploaded)\b|(?:из|по)\s+(?:этого|этому|прикрепл[её]нному|загруженному)\s+фото/iu
  if (create.test(text) && !editReference.test(text) && isExplicitImageGenerationRequest(prompt)) return "generate"
  if (isExplicitImageEditRequest(text, hasImage)) return "edit"
  // Short revisions such as “make it blue” require an image already in this chat.
  if (!hasImage || isTextOnlyMediaDiscussion(prompt) || primaryNonMediaArtifact(prompt)) {
    return isExplicitImageGenerationRequest(prompt) ? "generate" : null
  }
  const colorEdit = /^(?:(?:now|теперь|а)\s+)?(?:make\s+(?:it|the\s+(?:car|image))\s+(?:blue|red|green|black|white|yellow|orange|pink|purple|brighter|darker)|(?:сделай|перекрась)\s+(?:(?:его|е[её]|её|машину|авто|спорткар)\s+)?(?:сини\p{L}*|голуб\p{L}*|красн\p{L}*|зел[её]н\p{L}*|ч[её]рн\p{L}*|бел\p{L}*|ж[её]лт\p{L}*|ярче|темнее))(?:[.!\s]|$)/iu
  return colorEdit.test(text) ? "edit" : isExplicitImageGenerationRequest(prompt) ? "generate" : null
}

export function isFlashCodingRequest(prompt: string): boolean {
  const text = actionableRequest(prompt)
  if (!text || discussion.test(text) || requestedDocument.test(text) || flashImageOperation(prompt, false)) return false
  if (isSoftwareCreationRequest(text)) return true
  const artifact = primaryNonMediaArtifact(text)
  if (artifact && artifact !== "code" && artifact !== "website") return false
  if (artifact === "website" || artifact === "code") return true
  if (!action.test(text)) return false
  return software.test(text) || (/```|~~~/.test(prompt) && /(?:import |export |function\s+|class\s+|def\s+|<html|const\s+\w+\s*=)/u.test(prompt))
}
