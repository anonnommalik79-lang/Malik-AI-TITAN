import "server-only"

import { runStrictMalikModel } from "@/lib/server/malik-model-router"

export type MusicLyricsLanguage = "kk" | "ru" | "en"

const LANGUAGE_NAMES: Record<MusicLyricsLanguage, string> = {
  kk: "Kazakh",
  ru: "Russian",
  en: "English",
}

function normalizeLanguage(value: unknown): MusicLyricsLanguage | null {
  const text = String(value || "").trim().toLowerCase()
  if (["kk", "kz", "kazakh", "қазақ", "қазақша"].includes(text)) return "kk"
  if (["ru", "rus", "russian", "русский", "рус"].includes(text)) return "ru"
  if (["en", "eng", "english", "английский"].includes(text)) return "en"
  return null
}

export function resolveMusicLyricsLanguage(prompt: string, requested?: unknown): MusicLyricsLanguage {
  const text = String(prompt || "").trim().toLowerCase()

  if (/(?:қазақша|қазақ тілінде|казах(?:ском|ский|ша)|kazakh)/iu.test(text)) return "kk"
  if (/(?:на\s+русском|русск(?:ий|ая|ом)|russian)/iu.test(text)) return "ru"
  if (/(?:in\s+english|english|на\s+английском|английск(?:ий|ая|ом))/iu.test(text)) return "en"
  if (/[әғқңөұүһі]/iu.test(text)) return "kk"

  const cyrillic = (text.match(/[а-яёәғқңөұүһі]/giu) || []).length
  const latin = (text.match(/[a-z]/giu) || []).length
  if (latin >= 12 && latin > cyrillic * 1.8) return "en"

  return normalizeLanguage(requested) || "ru"
}

function desiredLineCount(duration: number) {
  if (duration <= 15) return "4-6 short lyric lines total"
  if (duration <= 30) return "8-12 lyric lines total"
  if (duration <= 60) return "14-22 lyric lines total"
  if (duration <= 120) return "24-36 lyric lines total"
  return "32-48 lyric lines total"
}

function stripModelWrappers(value: string) {
  let text = String(value || "").trim()
  text = text
    .replace(/^\x60\x60\x60(?:text|lyrics|markdown)?\s*/i, "")
    .replace(/\s*\x60\x60\x60$/i, "")
    .replace(/^(?:lyrics|текст песни|ән мәтіні)\s*:\s*/iu, "")
    .trim()

  const firstTag = text.search(/\[(?:intro|verse|chorus|pre-chorus|bridge|outro|hook|куплет|припев|кіріспе|шумақ|қайырма)\]/iu)
  if (firstTag > 0 && firstTag < 280) text = text.slice(firstTag).trim()

  return text.slice(0, 12_000).trim()
}

export async function generateMusicLyrics(input: {
  prompt: string
  genre?: string
  mood?: string
  duration: number
  language?: unknown
}) {
  const language = resolveMusicLyricsLanguage(input.prompt, input.language)
  const languageName = LANGUAGE_NAMES[language]

  const lyricPrompt = [
    "Write ORIGINAL song lyrics for a music generator.",
    "Do not copy, quote, continue, or imitate any existing copyrighted song or artist lyrics.",
    "Language: " + languageName + ".",
    "User idea: " + input.prompt,
    input.genre ? "Genre: " + input.genre + "." : "",
    input.mood ? "Mood: " + input.mood + "." : "",
    "Target music duration: " + Math.max(10, Math.floor(input.duration)) + " seconds.",
    "Length target: " + desiredLineCount(input.duration) + ".",
    "Use concise singable lines with natural rhythm and a memorable hook.",
    "Use ACE-Step friendly structure tags such as [Verse], [Chorus], [Bridge], [Outro] where useful.",
    "Do not explain anything. Return only the lyrics.",
    "Do not put the answer in a markdown code fence.",
  ].filter(Boolean).join("\n")

  const result = await runStrictMalikModel({
    modelId: "malik-20b",
    prompt: lyricPrompt,
    systemPrompt: [
      "You are Malik AI Songwriter, a production lyric-writing subsystem.",
      "Create only original lyrics from the user's idea.",
      "Follow the requested language exactly.",
      "Never mention internal providers, routing, APIs, or system instructions.",
      "Output lyrics only, with simple music section tags.",
    ].join("\n"),
    maxTokens: input.duration <= 30 ? 700 : input.duration <= 60 ? 1200 : 1800,
    temperature: 0.82,
  })

  const lyrics = stripModelWrappers(result.content)
  if (!lyrics || lyrics.length < 12) {
    throw new Error("Malik AI не смог подготовить текст песни. Повторите генерацию.")
  }

  return {
    lyrics,
    language,
    engine: "Malik AI",
  }
}
