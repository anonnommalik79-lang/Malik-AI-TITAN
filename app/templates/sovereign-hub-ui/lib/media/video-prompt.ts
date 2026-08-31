import { runStrictMalikModel } from "@/lib/server/malik-model-router"

const MODELS = ["malik-fast-120b", "malik-27b", "malik-20b"] as const

function quotedLines(value: string) {
  return (value.match(/[«"']([^«»"']{2,})[»"']/g) || [])
    .map((item) => item.replace(/^[«"']|[»"']$/g, "").trim())
    .filter(Boolean)
}

function numbers(value: string) {
  return value.match(/\d+/g) || []
}

function preservesRequest(source: string, candidate: string) {
  const text = candidate.trim()
  if (!text) return false
  const sourceWords = source.trim().split(/\s+/).filter(Boolean).length
  const candidateWords = text.split(/\s+/).filter(Boolean).length
  if (sourceWords >= 8 && candidateWords < sourceWords * 0.65) return false

  const foundNumbers = new Set(numbers(text))
  if (numbers(source).some((value) => !foundNumbers.has(value))) return false

  const lower = text.toLowerCase()
  if (!quotedLines(source).every((line) => lower.includes(line.toLowerCase()))) return false
  return true
}

const SYSTEM = [
  "You are MalikVideo Prompt Intelligence.",
  "Rewrite the user's Russian, Kazakh, English, slang, typo-heavy or mixed-language request into one precise English prompt for a photorealistic video-and-audio generator.",
  "Preserve every requested subject, count, identity, action, place, time, weather, color, object, camera movement and constraint.",
  "Never replace the user's plot with a different idea.",
  "Keep every quoted spoken line EXACTLY in its original language and explicitly state which language is spoken.",
  "Describe physically coherent motion, stable subject identity and camera behavior only when it helps execute what the user already requested.",
  "Do not claim a pixel resolution inside the prompt; output resolution is controlled by the MalikVideo pipeline.",
  "Return only the final generation prompt. No markdown, no explanation, no headings.",
].join(" ")

export async function compileMalikVideoPrompt(source: string, generateAudio = true) {
  const clean = String(source || "").replace(/\s+/g, " ").trim()
  if (!clean) return ""

  const systemPrompt = `${SYSTEM} ${generateAudio
    ? "Include natural synchronized ambience, sound effects and requested dialogue/audio."
    : "Do not invent speech, music or sound instructions."}`

  for (const modelId of MODELS) {
    try {
      const result = await runStrictMalikModel({
        modelId,
        prompt: clean,
        systemPrompt,
        maxTokens: 700,
        temperature: 0.1,
      })
      const candidate = String(result?.content || "")
        .replace(/^```(?:text)?\s*/i, "")
        .replace(/```$/i, "")
        .trim()
      if (preservesRequest(clean, candidate)) return candidate
    } catch {
      // Try the next free Malik model. The original prompt remains the final fallback.
    }
  }

  return clean
}
