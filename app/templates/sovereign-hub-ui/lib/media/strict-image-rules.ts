import type { ImageMode } from "./types"

function containsHumanRequest(value: string) {
  const lower = value.toLowerCase()
  return /\b(?:person|people|man|woman|boy|girl|human|portrait|football player|soccer player)\b/i.test(lower)
    || /(?:человек|люд|мужчин|женщин|девуш|парен|мальчик|девоч|футболист)/iu.test(lower)
}

function modeContract(mode?: ImageMode) {
  if (mode === "realistic") return "MODE: photorealistic; improve realism only, never alter requested content."
  if (mode === "product") return "MODE: product; preserve exact object, materials, colors and requested text."
  if (mode === "design") return "MODE: design; preserve exact content and verbatim requested text."
  if (mode === "cinematic") return "MODE: cinematic; lighting/camera may be cinematic, but subject, count, action and setting are locked."
  return ""
}

export function buildUnifiedStrictImagePrompt(compiledPrompt: string, rawPrompt: string, mode?: ImageMode) {
  const source = String(rawPrompt || "").trim()
  const prepared = String(compiledPrompt || source).trim()

  // Put the contract FIRST so providers with shorter prompt limits still receive
  // every semantic lock before any optional descriptive detail is truncated.
  const contract = [
    "MALIK IMAGE STRICT CONTRACT — HIGHEST PRIORITY:",
    "Exact requested subject/category/identity/count; never substitute, remove or duplicate a main subject.",
    "Preserve action, pose, relationship, setting, camera view, colors, materials, clothing and important attributes.",
    "Do not invent extra main people, portraits, animals, vehicles, props, logos, brands, signs or text.",
    "Requested visible text must stay verbatim in its original language and spelling.",
    "Style may improve quality, lighting and composition only; if style conflicts with content, the literal user request wins.",
    "Never replace a robot, vehicle, animal or requested object with an unrelated human portrait or scene.",
    "Keep the requested main subject clear, prominent and unmistakable.",
  ].join("\n")

  return [
    contract,
    modeContract(mode),
    `COMPILED IMAGE PROMPT: ${prepared}`,
    `ORIGINAL USER REQUEST (authoritative): ${source}`,
  ].filter(Boolean).join("\n\n")
}

export function buildUnifiedNegativePrompt(rawPrompt: string) {
  const source = String(rawPrompt || "").toLowerCase()
  const base = [
    "unrelated subject",
    "wrong subject",
    "subject substitution",
    "wrong object category",
    "wrong species",
    "wrong identity",
    "wrong count",
    "extra main subject",
    "duplicated subject",
    "wrong action",
    "wrong setting",
    "wrong pose",
    "wrong colors",
    "random portrait",
    "unrequested text",
    "misspelled text",
    "random logo",
    "watermark",
    "blurry",
    "low detail",
    "malformed anatomy",
    "distorted geometry",
  ]

  const asksHuman = containsHumanRequest(source)

  if (!asksHuman) {
    base.push("woman", "girl", "man", "boy", "human portrait", "fashion portrait", "random person")
  }

  if (/(?:трансформ|робот|android|mecha|transformer|robot)/iu.test(source) && !asksHuman) {
    base.push("human face as main subject", "ordinary human body", "person instead of robot")
  }

  if (/(?:машин|автомоб|car|vehicle|sports car|truck|motorcycle|мотоцикл)/iu.test(source) && !asksHuman) {
    base.push("portrait instead of vehicle", "person instead of vehicle", "missing vehicle")
  }

  if (/(?:cat|dog|horse|bird|lion|tiger|animal|кот|кошк|собак|лошад|птиц|лев|тигр|животн)/iu.test(source) && !asksHuman) {
    base.push("human instead of animal", "missing animal")
  }

  return [...new Set(base)].join(", ")
}
