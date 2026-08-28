import type { ImageMode } from "./types"

function containsHumanRequest(value: string) {
  const lower = value.toLowerCase()
  return /\b(?:person|people|man|woman|boy|girl|human|portrait|football player|soccer player)\b/i.test(lower)
    || /(?:человек|люд|мужчин|женщин|девуш|парен|мальчик|девоч|футболист)/iu.test(lower)
}

function modeContract(mode?: ImageMode) {
  if (mode === "realistic") return "STYLE MODE: photorealistic. Keep the scene believable, natural and physically coherent without changing any requested subject or action."
  if (mode === "product") return "STYLE MODE: product. Keep the exact requested product/object, materials, colors and visible text; only improve presentation and studio clarity."
  if (mode === "design") return "STYLE MODE: design. Keep the exact requested content and verbatim text; only improve composition, hierarchy and graphic precision."
  if (mode === "cinematic") return "STYLE MODE: cinematic. Lighting and camera may be cinematic, but subject, count, identity, action and setting are locked."
  return ""
}

export function buildUnifiedStrictImagePrompt(compiledPrompt: string, rawPrompt: string, mode?: ImageMode) {
  const source = String(rawPrompt || "").trim()
  const prepared = String(compiledPrompt || source).trim()

  const contract = [
    "MALIK IMAGE STRICT CONTRACT — HIGHEST PRIORITY:",
    "1. Depict the user's requested main subject exactly. Never substitute its category, species, identity, gender, age, object type or role.",
    "2. Preserve every requested action, pose, relationship, setting, location, camera view, color, material, clothing, style and important attribute.",
    "3. Preserve requested counts exactly. Do not duplicate, remove or replace main subjects.",
    "4. Do not invent extra people, portraits, animals, vehicles, props, logos, brands, signs or text unless the user explicitly requested them or they are unavoidable minor background detail.",
    "5. Any visible text requested by the user must remain verbatim in the original language and spelling. Do not translate or rewrite visible text.",
    "6. Style enhancement may improve quality, lighting and composition only; it must never change semantic content.",
    "7. If any stylistic hint conflicts with the requested subject or scene, the user's literal request wins.",
    "8. Never turn a robot into a person, a vehicle into a person, an animal into a human, or any requested object into an unrelated portrait/scene.",
    "9. Keep the requested main subject large, clear and unmistakable enough that the result can be verified against the request.",
  ].join("\n")

  return [
    `USER REQUEST (authoritative): ${source}`,
    `COMPILED IMAGE PROMPT: ${prepared}`,
    modeContract(mode),
    contract,
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
