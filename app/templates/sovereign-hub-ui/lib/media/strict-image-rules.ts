import { buildImageIntentPlan, type ImageIntentPlan } from "./image-intent-engine"
import type { ImageMode } from "./types"

function modeContract(mode?: ImageMode) {
  if (mode === "realistic") return "MODE LOCK: photorealistic; improve realism only, never alter requested content."
  if (mode === "product") return "MODE LOCK: product photography; preserve exact object, materials, colors and requested text."
  if (mode === "design") return "MODE LOCK: design; preserve exact content, layout intent and verbatim requested text."
  if (mode === "cinematic") return "MODE LOCK: cinematic; lighting/camera may be cinematic, but subject, count, action and setting are immutable."
  return ""
}

function line(label: string, values: string[]) {
  return values.length ? `${label}: ${values.join(" | ")}` : ""
}

function planFor(compiledPrompt: string, rawPrompt: string, mode?: ImageMode, intent?: ImageIntentPlan) {
  return intent || buildImageIntentPlan(rawPrompt, compiledPrompt, mode)
}

export function buildUnifiedStrictImagePrompt(
  compiledPrompt: string,
  rawPrompt: string,
  mode?: ImageMode,
  intent?: ImageIntentPlan,
) {
  const plan = planFor(compiledPrompt, rawPrompt, mode, intent)

  // Contract is deliberately placed first: if a provider truncates the tail,
  // semantic locks survive while optional prose is what gets dropped.
  const contract = [
    "MALIK IMAGE SEMANTIC LOCK — HIGHEST PRIORITY, NON-NEGOTIABLE:",
    "Treat the ORIGINAL USER REQUEST as authoritative evidence and the LOCKED INTENT fields below as hard constraints.",
    "Never substitute, remove, merge, split or duplicate a requested main subject.",
    "Never change subject category/species/identity, exact count, action, pose, relationship, setting, camera view, requested colors, materials, clothing or important attributes.",
    "Do not invent extra main people, portraits, animals, vehicles, props, brands, logos, signs or visible text unless explicitly requested.",
    "Visible text is literal data: keep every requested character, word, language and spelling exactly as provided.",
    "Style, beauty, lighting and composition are secondary. If any artistic choice conflicts with literal content, literal content wins.",
    "Do not turn a robot into a person, a vehicle into a portrait, an animal into a human, or any requested object into an unrelated scene.",
    "If wording is noisy, accented, misspelled or mixed-language, preserve the recovered meaning instead of guessing a different subject.",
    "When uncertain, choose the interpretation closest to the original words and add nothing that was not requested.",
  ].join("\n")

  const lockedIntent = [
    `INTENT FINGERPRINT: ${plan.fingerprint}`,
    `INPUT LANGUAGE: ${plan.language}`,
    line("LOCKED SUBJECTS", plan.subjectCategories),
    plan.count ? `LOCKED MAIN-SUBJECT COUNT: ${plan.count}` : "LOCKED MAIN-SUBJECT COUNT: unspecified — do not duplicate the main subject without evidence",
    line("LOCKED COLORS", plan.colors),
    line("LOCKED SETTINGS", plan.settings),
    line("LOCKED CAMERA", plan.camera),
    line("LOCKED STYLE", plan.styles),
    line("MUST INCLUDE", plan.mustInclude),
    line("MUST NOT INCLUDE", plan.mustNotInclude),
    line("VISIBLE TEXT VERBATIM", plan.visibleText),
    line("PRIORITY ORDER", plan.priorityOrder),
    line("AMBIGUITY RULES", plan.ambiguityFlags),
  ].filter(Boolean).join("\n")

  return [
    contract,
    lockedIntent,
    modeContract(mode),
    `SEMANTIC NORMALIZATION (for typo/accent recovery only): ${plan.semanticText}`,
    `COMPILED IMAGE PROMPT: ${plan.compiledPrompt}`,
    `ORIGINAL USER REQUEST — AUTHORITATIVE: ${plan.rawRequest}`,
    "FINAL EXECUTION RULE: render one image that satisfies all locked facts simultaneously. Do not paraphrase the task again before rendering.",
  ].filter(Boolean).join("\n\n")
}

export function buildUnifiedNegativePrompt(
  rawPrompt: string,
  compiledPrompt = "",
  mode?: ImageMode,
  intent?: ImageIntentPlan,
) {
  const plan = planFor(compiledPrompt || rawPrompt, rawPrompt, mode, intent)
  const base = [
    "unrelated subject",
    "wrong subject",
    "subject substitution",
    "wrong object category",
    "wrong species",
    "wrong identity",
    "wrong count",
    "extra main subject",
    "duplicated main subject",
    "missing main subject",
    "wrong action",
    "wrong relationship",
    "wrong setting",
    "wrong pose",
    "wrong camera view",
    "wrong colors",
    "wrong materials",
    "wrong clothing",
    "random portrait",
    "unrequested text",
    "misspelled requested text",
    "random logo",
    "random brand",
    "watermark",
    "blurry",
    "low detail",
    "malformed anatomy",
    "distorted geometry",
  ]

  const subjects = plan.subjectCategories.join(" ").toLowerCase()
  const asksHuman = /(?:human|person|woman|girl|man|boy|football player)/i.test(subjects)

  if (!asksHuman) {
    base.push("random person", "human portrait", "fashion portrait")
  }

  if (/(?:robot|transformer|mecha)/i.test(subjects) && !asksHuman) {
    base.push("human face as main subject", "ordinary human body", "person instead of robot", "missing robot")
  }

  if (/(?:vehicle|car|motorcycle)/i.test(subjects) && !asksHuman) {
    base.push("portrait instead of vehicle", "person instead of vehicle", "missing vehicle")
  }

  if (/(?:cat|dog|horse|bird)/i.test(subjects) && !asksHuman) {
    base.push("human instead of animal", "wrong animal species", "missing animal")
  }

  for (const excluded of plan.mustNotInclude) {
    base.push(`forbidden: ${excluded}`)
  }

  return [...new Set(base.map((item) => item.trim()).filter(Boolean))].join(", ")
}
