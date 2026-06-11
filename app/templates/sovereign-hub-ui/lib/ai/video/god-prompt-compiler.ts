export type VideoAspectRatio = "16:9" | "9:16" | "1:1" | "4:3" | "3:4" | string

export type CompiledVideoPrompt = {
  rawPrompt: string
  title: string
  englishPrompt: string
  negativePrompt: string
  providerPrompt: string
  durationSeconds: number
  aspectRatio: VideoAspectRatio
  confidence: number
  detectedLanguage: "ru" | "kk" | "en" | "mixed"
  subject: string
  scene: string
  motion: string
}

const ruToEn: Array<[RegExp, string]> = [
  [/\bсгенерируй\b/gi, "generate"],
  [/\bсоздай\b/gi, "create"],
  [/\bвидео\b/gi, "video"],
  [/\bтемн(ого|ый|ая|ое)?\b/gi, "dark"],
  [/\bпринц(а|ем|у)?\b/gi, "prince"],
  [/\bкороль\b/gi, "king"],
  [/\bвоин\b/gi, "warrior"],
  [/\bдевушка\b/gi, "young woman"],
  [/\bпарень\b/gi, "young man"],
  [/\bснег(ом|а|у)?\b/gi, "snow"],
  [/\bдождь\b/gi, "rain"],
  [/\bночь\b/gi, "night"],
  [/\bгород\b/gi, "city"],
  [/\bалматы\b/gi, "Almaty"],
  [/\bказахстан\b/gi, "Kazakhstan"],
  [/\bкиберпанк\b/gi, "cyberpunk"],
  [/\bреалистичн(о|ый|ая|ое)?\b/gi, "realistic"],
  [/\bкинематографичн(о|ый|ая|ое)?\b/gi, "cinematic"],
  [/\bдвижение камеры\b/gi, "camera movement"],
  [/\bполет\b/gi, "flying"],
  [/\bдракон\b/gi, "dragon"],
  [/\bмеч\b/gi, "sword"],
  [/\bзамок\b/gi, "castle"],
  [/\bлес\b/gi, "forest"],
]

const kkToEn: Array<[RegExp, string]> = [
  [/\bбейне\b/gi, "video"],
  [/\bжаса\b/gi, "create"],
  [/\bқараңғы\b/gi, "dark"],
  [/\bханзада\b/gi, "prince"],
  [/\bқар\b/gi, "snow"],
  [/\bтүн\b/gi, "night"],
  [/\bқала\b/gi, "city"],
  [/\bайдаһар\b/gi, "dragon"],
]

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim()
}

function detectLanguage(prompt: string): CompiledVideoPrompt["detectedLanguage"] {
  const cyr = /[а-яәғқңөұүһі]/i.test(prompt)
  const kk = /[әғқңөұүһі]/i.test(prompt)
  const en = /[a-z]/i.test(prompt)
  if (kk && en) return "mixed"
  if (kk) return "kk"
  if (cyr && en) return "mixed"
  if (cyr) return "ru"
  return "en"
}

function roughTranslate(prompt: string) {
  let value = prompt
  for (const [from, to] of [...ruToEn, ...kkToEn]) value = value.replace(from, to)
  return normalizeWhitespace(value)
}

function extractDuration(prompt: string, fallback = 5) {
  const match = prompt.match(/(\d{1,2})\s*(sec|secs|second|seconds|сек|секунд|s)\b/i)
  if (!match) return fallback
  const n = Number(match[1])
  if (!Number.isFinite(n)) return fallback
  return Math.max(3, Math.min(n, 12))
}

function cleanUserPrompt(prompt: string) {
  return normalizeWhitespace(
    prompt
      .replace(/\b(сгенерируй|создай|generate|create|make)\b/gi, "")
      .replace(/\b(видео|video)\b/gi, "")
      .replace(/\b\d{1,2}\s*(sec|secs|second|seconds|сек|секунд|s)\b/gi, "")
      .replace(/\b(16:9|9:16|1:1|4:3|3:4)\b/gi, "")
      .replace(/[:：]/g, " ")
  )
}

function extractAspectRatio(prompt: string, fallback: VideoAspectRatio = "16:9") {
  const match = prompt.match(/\b(16:9|9:16|1:1|4:3|3:4)\b/i)
  return (match?.[1] || fallback) as VideoAspectRatio
}

function inferScene(english: string) {
  const lower = english.toLowerCase()
  if (lower.includes("snow")) return "cold snowy atmosphere, visible falling snow particles, winter air, cinematic depth"
  if (lower.includes("rain")) return "rainy cinematic atmosphere, wet reflections, dramatic light scattering"
  if (lower.includes("city") || lower.includes("almaty")) return "night city environment, realistic urban scale, neon reflections, deep cinematic contrast"
  if (lower.includes("castle") || lower.includes("prince") || lower.includes("king")) return "dark royal fantasy environment, dramatic backlight, premium trailer atmosphere"
  if (lower.includes("dragon")) return "epic fantasy environment, volumetric clouds, scale, smoke, dramatic light"
  return "cinematic environment that strictly matches the user's subject"
}

function inferMotion(english: string) {
  const lower = english.toLowerCase()
  if (lower.includes("fight") || lower.includes("battle")) return "dynamic but stable action motion, readable choreography, no chaotic cuts"
  if (lower.includes("fly") || lower.includes("flying")) return "smooth aerial camera movement, stable subject tracking, cinematic parallax"
  return "slow dolly-in camera movement, stable composition, smooth natural motion"
}

function titleCase(value: string) {
  const words = normalizeWhitespace(value).split(" ").filter(Boolean).slice(0, 8)
  return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ") || "MALIK AI Video"
}

export function compileGodVideoPrompt(input: {
  prompt: string
  durationSeconds?: number
  aspectRatio?: VideoAspectRatio
  style?: string
}): CompiledVideoPrompt {
  const rawPrompt = normalizeWhitespace(input.prompt || "")
  const detectedLanguage = detectLanguage(rawPrompt)
  const durationSeconds = Math.max(3, Math.min(input.durationSeconds || extractDuration(rawPrompt, 5), 12))
  const aspectRatio = input.aspectRatio || extractAspectRatio(rawPrompt, "16:9")
  const cleaned = cleanUserPrompt(rawPrompt)
  const translated = roughTranslate(cleaned || rawPrompt)
  const subject = translated || "the exact subject requested by the user"
  const scene = inferScene(translated)
  const motion = inferMotion(translated)
  const style = input.style || "realistic premium cinematic trailer, high detail, natural motion, coherent subject identity"

  const negativePrompt = [
    "random unrelated people",
    "wrong character",
    "wrong location",
    "changed gender",
    "changed age",
    "unrelated Asian street scene unless requested",
    "cartoon",
    "anime",
    "low quality",
    "text artifacts",
    "watermark",
    "extra limbs",
    "distorted face",
    "flickering identity",
    "chaotic camera",
  ].join(", ")

  const englishPrompt = [
    `Create a ${durationSeconds}-second cinematic AI video.`,
    ``,
    `MAIN SUBJECT: ${subject}.`,
    ``,
    `STRICT FOLLOWING RULES:`,
    `- Follow the user's subject literally.`,
    `- Keep the main subject centered and visible.`,
    `- Do not replace the subject with a random person or unrelated scene.`,
    `- Do not change the character, costume, location, weather, or theme unless the user asks.`,
    ``,
    `SCENE: ${scene}.`,
    `CAMERA: ${motion}.`,
    `STYLE: ${style}.`,
    `FORMAT: ${aspectRatio}, ${durationSeconds} seconds, cinematic composition.`,
  ].join("\n")

  const providerPrompt = [
    englishPrompt,
    ``,
    `NEGATIVE PROMPT: ${negativePrompt}`,
  ].join("\n")

  return {
    rawPrompt,
    title: titleCase(subject),
    englishPrompt,
    negativePrompt,
    providerPrompt,
    durationSeconds,
    aspectRatio,
    confidence: rawPrompt.length > 8 ? 0.86 : 0.55,
    detectedLanguage,
    subject,
    scene,
    motion,
  }
}
