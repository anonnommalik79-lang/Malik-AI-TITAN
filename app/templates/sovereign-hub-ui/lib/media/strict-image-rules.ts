import { buildImageIntentPlan, type ImageIntentPlan } from "./image-intent-engine"
import type { ImageMode } from "./types"

function modeContract(mode?: ImageMode) {
  if (mode === "realistic") return "STYLE ONLY: photorealistic. Never change the requested subject or action."
  if (mode === "product") return "STYLE ONLY: product photography. Never change the requested object, materials, colors or text."
  if (mode === "design") return "STYLE ONLY: design rendering. Never change the requested content or layout intent."
  if (mode === "cinematic") return "STYLE ONLY: cinematic lighting/composition. Never change the requested subject, count, action or setting."
  return ""
}

function unique(values: string[]) {
  return values.map((value) => value.trim()).filter(Boolean).filter((value, index, list) => list.indexOf(value) === index)
}

function line(label: string, values: string[]) {
  return values.length ? `${label}: ${values.join(" | ")}` : ""
}

function planFor(compiledPrompt: string, rawPrompt: string, mode?: ImageMode, intent?: ImageIntentPlan) {
  return intent || buildImageIntentPlan(rawPrompt, compiledPrompt, mode)
}

type CriticalVisualLocks = {
  subjects: string[]
  actions: string[]
  negatives: string[]
  humanIntent: boolean
}

/**
 * Image diffusion models follow short visual facts better than long policy-like
 * prose. These locks recover high-value nouns/actions directly from the raw +
 * compiled request, including common RU/KK/EN wording that may not yet exist in
 * the deterministic intent lexicon. The compiled description remains the main
 * source of truth; these are hard anchors against subject substitution.
 */
function criticalVisualLocks(rawPrompt: string, compiledPrompt: string): CriticalVisualLocks {
  const text = `${rawPrompt} ${compiledPrompt}`.toLowerCase().replace(/ё/g, "е")
  const subjects: string[] = []
  const actions: string[] = []
  const negatives: string[] = []

  if (/(?:\bboxers?\b|\bboxing\s+(?:fighter|athlete)s?\b|боксер(?:а|ы|ов|ом|ами)?\b|боксёр(?:а|ы|ов|ом|ами)?\b)/iu.test(text)) {
    subjects.push("boxer / boxing athlete")
    negatives.push("fashion portrait instead of boxing", "unrelated lone portrait")
  }
  if (/(?:\bboat\b|\bboats\b|\bship\b|\bships\b|\byacht\b|\bwatercraft\b|лодк(?:а|у|и|ой|е)?\b|корабл(?:ь|я|и|ем|ей)\b|катер(?:а|ы|ом)?\b|яхт(?:а|у|ы|ой)?\b)/iu.test(text)) {
    subjects.push("boat / ship / watercraft")
    negatives.push("missing boat", "land vehicle instead of boat", "portrait instead of boat")
  }
  if (/(?:\bairplane\b|\bplane\b|\baircraft\b|самолет(?:а|ы|ом)?\b|самолёт(?:а|ы|ом)?\b)/iu.test(text)) {
    subjects.push("airplane / aircraft")
    negatives.push("missing aircraft", "portrait instead of aircraft")
  }
  if (/(?:\bhelicopter\b|вертолет(?:а|ы|ом)?\b|вертолёт(?:а|ы|ом)?\b)/iu.test(text)) {
    subjects.push("helicopter")
    negatives.push("missing helicopter", "portrait instead of helicopter")
  }
  if (/(?:\bbicycle\b|\bbike\b|велосипед(?:а|ы|ом)?\b)/iu.test(text)) subjects.push("bicycle")
  if (/(?:\btrain\b|поезд(?:а|ы|ом)?\b)/iu.test(text)) subjects.push("train")
  if (/(?:\btruck\b|грузовик(?:а|и|ом)?\b)/iu.test(text)) subjects.push("truck")
  if (/(?:\bsports?\s*car\b|\bsupercar\b|спорт\s*кар|спорткар(?:а|ы|ом)?\b)/iu.test(text)) {
    subjects.push("sports car")
    negatives.push("cat collage", "unrelated animal", "portrait instead of sports car")
  }
  if (/(?:\bfrogs?\b|лягушк(?:а|у|и|ой)?\b|бақа)/iu.test(text)) {
    subjects.push("frog")
    negatives.push("missing frog", "cat instead of frog", "human portrait instead of frog")
  }
  if (/(?:\bice\s*cream\b|морожен(?:ое|ого|ым|ое|ку)|балмұздақ)/iu.test(text)) {
    subjects.push("ice cream")
    negatives.push("missing ice cream", "different food instead of ice cream")
  }
  if (/(?:\bdragon\b|дракон(?:а|ы|ом)?\b)/iu.test(text)) subjects.push("dragon")
  if (/(?:\bdinosaur\b|динозавр(?:а|ы|ом)?\b)/iu.test(text)) subjects.push("dinosaur")

  if (/(?:\bfly(?:ing|ies)?\b|\bairborne\b|\bin the air\b|летающ|летящ|летит\b|в воздухе|ұшып|ұшатын)/iu.test(text)) {
    actions.push("clearly airborne / visibly flying")
    negatives.push("grounded when flight is requested", "only floating on water when flight is requested")
  }
  if (/(?:\bfight(?:ing|s)?\b|\bboxing match\b|\bboxing bout\b|\bcombat\b|бой\b|дер(?:утся|ется|ущийся)|сража|төбелес)/iu.test(text)) {
    actions.push("active fight / combat between the requested subjects")
    negatives.push("passive portrait instead of the requested fight", "subjects not interacting")
  }
  if (/(?:\bsit(?:ting|s)?\b|сидит\b|сидящ)/iu.test(text)) actions.push("sitting")
  if (/(?:\brun(?:ning|s)?\b|бежит\b|бегущ)/iu.test(text)) actions.push("running")
  if (/(?:\bjump(?:ing|s)?\b|прыга|прыжок)/iu.test(text)) actions.push("jumping")
  if (/(?:\bswim(?:ming|s)?\b|плывет\b|плывёт\b|плава)/iu.test(text)) actions.push("swimming / moving through water")
  if (/(?:\bdrive|driving\b|за рулем|за рулём|едет на)/iu.test(text)) actions.push("driving")
  if (/(?:\bhold(?:ing|s)?\b|держит\b|держат\b)/iu.test(text)) actions.push("holding the requested object")
  if (/(?:\beat(?:ing|s)?\b|куша(?:ет|ющий|ют)|ест\b|поеда(?:ет|ющий)|жеп\s*(?:отыр|жатыр)|жейд[іы])/iu.test(text)) {
    actions.push("active eating is unmistakable: the requested food is raised to and visibly touching the mouth, with a bite or lick in progress")
    negatives.push("food merely nearby instead of being eaten", "food held away from the mouth")
  }

  const humanIntent = /(?:\bperson\b|\bpeople\b|\bhuman\b|\bwoman\b|\bgirl\b|\bman\b|\bboy\b|\bboxers?\b|\bathlete\b|человек|люди|женщин|девуш|мужчин|парень|боксер|боксёр|спортсмен)/iu.test(text)
  return {
    subjects: unique(subjects),
    actions: unique(actions),
    negatives: unique(negatives),
    humanIntent,
  }
}

export function buildUnifiedStrictImagePrompt(
  compiledPrompt: string,
  rawPrompt: string,
  mode?: ImageMode,
  intent?: ImageIntentPlan,
) {
  const plan = planFor(compiledPrompt, rawPrompt, mode, intent)
  const critical = criticalVisualLocks(rawPrompt, compiledPrompt)
  const subjects = unique([...critical.subjects, ...plan.subjectCategories])
  const visualRequest = String(plan.compiledPrompt || plan.semanticText || plan.normalizedRequest || rawPrompt).trim()

  // Keep the actual scene description FIRST and the constraint block SHORT.
  // Diffusion/image models are not chat LLMs: huge instruction contracts can
  // dilute the visual nouns. This format maximizes prompt adherence while still
  // preserving the deterministic locks prepared by Malik AI.
  const hardFacts = [
    subjects.length
      ? `PRIMARY SUBJECT — MUST APPEAR: ${subjects.join(" | ")}`
      : `PRIMARY SUBJECT — MUST APPEAR: preserve the exact main noun/object from this request: ${plan.semanticText || plan.normalizedRequest}`,
    plan.count ? `EXACT MAIN-SUBJECT COUNT: ${plan.count}` : "",
    line("REQUIRED ACTION", critical.actions),
    line("REQUIRED COLORS", plan.colors),
    line("REQUIRED SETTING", plan.settings),
    line("REQUIRED CAMERA", plan.camera),
    line("MUST NOT INCLUDE", unique([...critical.negatives, ...plan.mustNotInclude])),
    line("VISIBLE TEXT — COPY VERBATIM", plan.visibleText),
  ].filter(Boolean).join("\n")

  return [
    `AUTHORITATIVE USER REQUEST — RENDER IT LITERALLY:\n${plan.rawRequest}`,
    visualRequest !== plan.rawRequest ? `LOSSLESS ENGLISH DESCRIPTION:\n${visualRequest}` : "",
    `NON-NEGOTIABLE VISUAL FACTS:\n${hardFacts}`,
    modeContract(mode),
    "FIDELITY RULE: subject, count and action are more important than beauty/style. Never replace the requested subject with an unrelated person, portrait, object or scene. Do not invent a dominant forest/portrait/background when it was not requested.",
    "OUTPUT: one coherent image, never a four-panel collage unless the user explicitly asks for a collage.",
  ].filter(Boolean).join("\n\n")
}

export function buildUnifiedNegativePrompt(
  rawPrompt: string,
  compiledPrompt = "",
  mode?: ImageMode,
  intent?: ImageIntentPlan,
) {
  const plan = planFor(compiledPrompt || rawPrompt, rawPrompt, mode, intent)
  const critical = criticalVisualLocks(rawPrompt, compiledPrompt)
  const subjects = unique([...critical.subjects, ...plan.subjectCategories]).join(" ").toLowerCase()
  const base = [
    "unrelated subject",
    "wrong main subject",
    "subject substitution",
    "missing requested subject",
    "wrong count",
    "wrong action",
    "random portrait",
    "unrequested dominant scene",
    "random cloaked figure",
    "watermark",
    "random text",
    "blurry",
    "low detail",
    ...critical.negatives,
  ]

  if (!critical.humanIntent && subjects) {
    base.push("random woman", "random girl", "random man", "human portrait as main subject", "fashion portrait")
  }

  if (/(?:robot|transformer|mecha)/i.test(subjects) && !critical.humanIntent) {
    base.push("person instead of robot", "human face as main subject", "missing robot")
  }

  if (/(?:vehicle|car|motorcycle|aircraft|airplane|helicopter|boat|ship|watercraft|train|truck|bicycle)/i.test(subjects) && !critical.humanIntent) {
    base.push("portrait instead of requested vehicle/object", "missing requested vehicle/object")
  }

  if (/(?:cat|dog|horse|bird|frog|dragon|dinosaur)/i.test(subjects) && !critical.humanIntent) {
    base.push("human instead of requested creature", "missing requested creature")
  }

  if (plan.count === 2) {
    base.push("only one main subject", "three or more main subjects")
  }

  if (!plan.settings.some((setting) => /forest/i.test(setting))) {
    base.push("unrequested forest as dominant background")
  }

  for (const excluded of plan.mustNotInclude) {
    base.push(`forbidden: ${excluded}`)
  }

  return [...new Set(base.map((item) => item.trim()).filter(Boolean))].join(", ")
}
