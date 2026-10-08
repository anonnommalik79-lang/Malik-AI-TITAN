export type MusicGenreIntent = "phonk" | "trap" | "hiphop" | "lofi" | "edm" | "other"
export type MusicMoodIntent = "Агрессивный" | "Спокойный" | "Атмосферный" | "Энергичный" | "Грустный" | "Другое"

export type MusicPromptIntent = {
  instrumental?: boolean
  vocalDirective?: "instrumental" | "vocal"
  genre?: MusicGenreIntent
  style?: string
  mood?: MusicMoodIntent
  instruments: string[]
  excludedInstruments: string[]
  bpm?: number
  providerHints: string[]
  explicit: boolean
}

const NO_VOCALS_RE = /(?:без\s+(?:слов|текста|вокала|голоса|пения)|безвокал|минусовк\w*|инструментал(?:ьн\w*)?|только\s+(?:музык|мелоди|инструмент)|no\s+vocals?|without\s+vocals?|no\s+singing|instrumental|music\s+only|сөзсіз|вокалсыз|дауыссыз)/iu
const VOCALS_RE = /(?:с\s+(?:вокалом|голосом|текстом)|со\s+словами|песн(?:я|ю|и)|спой|спеть|куплет\w*|припев\w*|вокал(?:ьн\w*)?|лирик\w*|lyrics?|vocals?|sing(?:ing|er)?|song|ән|әнші|қайырма|шумақ)/iu
const BEAT_ONLY_RE = /(?:\bbeats?\b|\bbacking\s+track\b|бит\w*|минусовк\w*|фонограмм\w*)/iu
const RAP_RE = /(?:\brap\b|рэп|реп\b)/iu

function instrumentNegated(prompt: string, re: RegExp): boolean {
  // Inspect every mention. "No piano, add piano in the chorus" requires piano.
  const matcher = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g")
  const matches = Array.from(prompt.matchAll(matcher))
  if (!matches.length) return false
  return matches.every((match) => {
    const before = prompt.slice(Math.max(0, (match.index ?? 0) - 42), match.index)
    const phrase = before.split(/[,.!?;\n]/).pop() || ""
    const negative = phrase.match(/(?:^|[^\p{L}\p{N}])(?:без|никаких|избегай|исключи|without|no|avoid|exclude)\s+([\p{L}\s-]{0,35})$/iu)
    if (!negative) return false
    // A negation ends when a new positive arrangement instruction begins.
    // "Без слов только пианино" excludes vocals, not the requested piano;
    // "без барабанов и гитары" still excludes both listed instruments.
    return !/(?:^|\s)(?:только|но|зато|с|со|на|добавь|добавить|only|but|with|add|include|use)(?:\s|$)/iu.test(negative[1])
  })
}

function requestedBpm(prompt: string): number | undefined {
  const suffix = prompt.match(/\b(\d{2,3})\s*(?:bpm|удар\w*\s+в\s+минуту)\b/iu)
  const prefix = prompt.match(/\bbpm\s*[:=]?\s*(\d{2,3})\b/iu)
  const tempo = prompt.match(/темп\w*\s*[:=]?\s*(\d{2,3})\b/iu)
  const value = Number((suffix || prefix || tempo)?.[1])
  return Number.isInteger(value) && value >= 30 && value <= 300 ? value : undefined
}

const GENERIC_INSTRUMENTAL_RE = /(?:музык\w*|трек\w*|бит\w*|мелоди\w*|саундтрек\w*|music|track|beat|melody|әуен)/iu

const INSTRUMENTS: Array<{ re: RegExp; name: string; hint: string }> = [
  { re: /(?:пианино|фортепиано|рояль|piano)/iu, name: "piano", hint: "Acoustic piano must be the clearly dominant instrument." },
  { re: /(?:гитар\w*|guitar)/iu, name: "guitar", hint: "Guitar must be clearly audible and central to the arrangement." },
  { re: /(?:скрипк\w*|violin)/iu, name: "violin", hint: "Violin must be clearly audible and central to the arrangement." },
  { re: /(?:виолончел\w*|cello)/iu, name: "cello", hint: "Cello must be clearly audible and central to the arrangement." },
  { re: /(?:саксофон\w*|saxophone|sax\b)/iu, name: "saxophone", hint: "Saxophone must be clearly audible and central to the arrangement." },
  { re: /(?:флейт\w*|flute)/iu, name: "flute", hint: "Flute must be clearly audible and central to the arrangement." },
  { re: /(?:барабан\w*|ударн\w*|drums?|percussion)/iu, name: "drums", hint: "Drums/percussion must drive the rhythm." },
  { re: /(?:синтезатор\w*|синт\w*|synth(?:esizer)?)/iu, name: "synthesizer", hint: "Synthesizer should be a primary timbral element." },
]

const GENRES: Array<{ re: RegExp; genre: MusicGenreIntent; hint: string }> = [
  { re: /\bphonk\b|фонк/iu, genre: "phonk", hint: "Genre: phonk." },
  { re: /\btrap\b|трэп|трап/iu, genre: "trap", hint: "Genre: trap." },
  { re: /hip[ -]?hop|хип[ -]?хоп|\brap\b|рэп|реп\b/iu, genre: "hiphop", hint: "Genre: hip-hop." },
  { re: /lo[ -]?fi|лоу[ -]?фай|лофи/iu, genre: "lofi", hint: "Genre: lo-fi." },
  { re: /\bedm\b|электронн\w*\s+танцевальн\w*/iu, genre: "edm", hint: "Genre: EDM." },
]

const EXTRA_STYLES: Array<{ re: RegExp; name: string }> = [
  { re: /\b(?:jazz|swing|bebop)\b|джаз/iu, name: "jazz" },
  { re: /\b(?:rock|indie rock|punk)\b|рок[ауы]?(\b|[\s,.!?])/iu, name: "rock" },
  { re: /\b(?:metal|heavy metal)\b|металл?\b/iu, name: "metal" },
  { re: /\b(?:classical|orchestral|symphony)\b|классическ[\p{L}]*|оркестров[\p{L}]*/iu, name: "classical / orchestral" },
  { re: /\b(?:techno|house)\b|техно|хаус/iu, name: "techno / house" },
  { re: /\b(?:ambient|new age)\b|эмбиент/iu, name: "ambient" },
  { re: /\b(?:synthwave|retrowave)\b|синтвейв/iu, name: "synthwave" },
  { re: /\b(?:pop|k-pop|j-pop)\b|поп(?:-музык[\p{L}]*)?/iu, name: "pop" },
  { re: /\b(?:country|bluegrass)\b|кантри/iu, name: "country" },
  { re: /\b(?:reggae|ska)\b|регги/iu, name: "reggae" },
  { re: /\b(?:drum\s*(?:and|&|n)\s*bass|dnb|d&b)\b|драм[\s-]*н[\s-]*бейс/iu, name: "drum and bass" },
]

const MOODS: Array<{ re: RegExp; mood: MusicMoodIntent; hint: string }> = [
  { re: /(?:грустн\w*|печальн\w*|меланхол\w*|sad|melanchol|sorrow)/iu, mood: "Грустный", hint: "Mood: sad, melancholic and emotional." },
  { re: /(?:спокойн\w*|тих\w*|мягк\w*|расслаб\w*|calm|relax|gentle|soft)/iu, mood: "Спокойный", hint: "Mood: calm, gentle and restrained." },
  { re: /(?:атмосферн\w*|кинематографич\w*|cinematic|atmospheric|ambient)/iu, mood: "Атмосферный", hint: "Mood: atmospheric and cinematic." },
  { re: /(?:энергичн\w*|бодр\w*|energetic|upbeat)/iu, mood: "Энергичный", hint: "Mood: energetic and driving." },
  { re: /(?:агрессивн\w*|жестк\w*|жёстк\w*|aggressive|hard-hitting)/iu, mood: "Агрессивный", hint: "Mood: aggressive and hard-hitting." },
]

export function analyzeMusicPrompt(promptValue: unknown): MusicPromptIntent {
  const prompt = String(promptValue || "").trim()
  const instruments = INSTRUMENTS.filter((item) => item.re.test(prompt) && !instrumentNegated(prompt, item.re))
  const excludedInstruments = INSTRUMENTS.filter((item) => item.re.test(prompt) && instrumentNegated(prompt, item.re))
  const genre = GENRES.find((item) => item.re.test(prompt))
  const style = !genre ? EXTRA_STYLES.find((item) => item.re.test(prompt)) : undefined
  const mood = MOODS.find((item) => item.re.test(prompt))

  const explicitlyNoVocals = NO_VOCALS_RE.test(prompt)
  const explicitlyVocals = VOCALS_RE.test(prompt) || /(?:женск[\p{L}]*|мужск[\p{L}]*)\s+(?:голос[\p{L}]*|вокал[\p{L}]*)|(?:female|male)\s+(?:lead\s+)?vocals?/iu.test(prompt)
  const explicitlyOnlyInstrument = /(?:только|only)\s+(?:скрипк[\p{L}]*|пианино|гитар[\p{L}]*|фортепиано|виолончел[\p{L}]*|флейт[\p{L}]*|барабан[\p{L}]*|саксофон[\p{L}]*|piano|violin|guitar|cello|flute|drums)/iu.test(prompt) && !explicitlyVocals
  const genericMusic = GENERIC_INSTRUMENTAL_RE.test(prompt)

  let instrumental: boolean | undefined
  // A requested singing voice overrides the generic word "beat";
  // explicit "no vocals" still takes precedence over every vocal request.
  if (explicitlyNoVocals || explicitlyOnlyInstrument) instrumental = true
  else if (explicitlyVocals) instrumental = false
  else if (BEAT_ONLY_RE.test(prompt)) instrumental = true
  else if (RAP_RE.test(prompt)) instrumental = false
  else if (instruments.length > 0 || genericMusic) instrumental = true

  const vocalDirective = explicitlyNoVocals || explicitlyOnlyInstrument ? "instrumental" as const
    : explicitlyVocals ? "vocal" as const
    : BEAT_ONLY_RE.test(prompt) ? "instrumental" as const
    : RAP_RE.test(prompt) ? "vocal" as const : undefined
  const bpm = requestedBpm(prompt)
  const vocalCharacter = /женск[\p{L}]*\s+(?:голос|вокал)|female\s+vocals?/iu.test(prompt)
    ? "Female lead vocals." : /мужск[\p{L}]*\s+(?:голос|вокал)|male\s+vocals?/iu.test(prompt)
      ? "Male lead vocals." : ""

  const providerHints = [
    ...instruments.map((item) => item.hint),
    ...excludedInstruments.map((item) => `Do not include ${item.name}.`),
    bpm ? `Target tempo: ${bpm} BPM.` : "",
    vocalCharacter,
    genre?.hint || "",
    style ? "Music style: " + style.name + "." : "",
    mood?.hint || "",
    instrumental === true ? "Instrumental only. No vocals, no spoken words, no singing." : "",
    instrumental === false ? "Vocal song. Include natural singing and respect the supplied lyrics/language." : "",
  ].filter(Boolean)

  return {
    instrumental,
    vocalDirective,
    genre: genre?.genre,
    style: style?.name,
    mood: mood?.mood,
    instruments: instruments.map((item) => item.name),
    excludedInstruments: excludedInstruments.map((item) => item.name),
    bpm,
    providerHints,
    explicit: Boolean(explicitlyNoVocals || explicitlyOnlyInstrument || explicitlyVocals || RAP_RE.test(prompt) || instruments.length || excludedInstruments.length || genre || style || mood || bpm),
  }
}


export type MusicBriefInput = {
  prompt: string
  lyrics?: string
  requestedInstrumental?: boolean
  genre?: string
  mood?: string
  lyricsLanguage?: "kk" | "ru" | "en" | "auto"
}

const MUSIC_LANGUAGE_NAMES = { kk: "Kazakh", ru: "Russian", en: "English" } as const

/**
 * One authoritative brief for every music provider and the UI readback.
 * In particular, a vague word such as "track" must not force instrumental
 * when the user explicitly requests lyrics or selected vocals.
 */
export function compileMusicBrief(input: MusicBriefInput) {
  const original = String(input.prompt || "").trim().slice(0, 2000)
  const intent = analyzeMusicPrompt(original)
  const hasLyrics = Boolean(String(input.lyrics || "").trim())
  const instrumental = intent.vocalDirective === "instrumental"
    ? true
    : intent.vocalDirective === "vocal"
      ? false
      : hasLyrics ? false : input.requestedInstrumental !== false

  const selectedGenre = String(input.genre || "").trim().toLowerCase()
  const genre: MusicGenreIntent = intent.genre ||
    (!intent.style && ["phonk", "trap", "hiphop", "lofi", "edm"].includes(selectedGenre)
      ? selectedGenre as MusicGenreIntent : "other")
  const selectedMood = String(input.mood || "").trim()
  const mood: MusicMoodIntent = intent.mood ||
    (["Агрессивный", "Спокойный", "Атмосферный", "Энергичный", "Грустный"].includes(selectedMood)
      ? selectedMood as MusicMoodIntent : "Другое")

  // The old backend sometimes passed BOTH "no vocals" and "sing the lyrics".
  // Only include hints compatible with the FINAL vocal decision.
  const cues = intent.providerHints.filter((hint) =>
    !hint.startsWith("Instrumental only.") && !hint.startsWith("Vocal song.")
  )
  if (genre !== "other" && !intent.genre) cues.push("Genre: " + genre + ".")
  if (mood !== "Другое" && !intent.mood) cues.push("Mood: " + mood + ".")
  const chosenLanguage = input.lyricsLanguage
  const lyricLanguage = chosenLanguage && chosenLanguage !== "auto"
    ? MUSIC_LANGUAGE_NAMES[chosenLanguage] : undefined
  cues.push(instrumental
    ? "STRICT: instrumental composition only; no singing, spoken voice or lyrical vocals."
    : "STRICT: vocal song; sing the supplied lyrics as written with clear, natural vocals.")
  if (!instrumental && lyricLanguage) cues.push("Lyrics and vocals in " + lyricLanguage + ".")

  // Keep both ends of very long descriptions: users often place an essential
  // "without X" or a key constraint at the very end of a long prompt.
  const guidance = cues.filter(Boolean).join(" ")
  const control = "Production instructions: " + guidance
  const allowance = Math.max(100, 2000 - control.length - 4)
  const description = original.length <= allowance
    ? original
    : original.slice(0, Math.floor(allowance * .65)).trimEnd() +
      " ... " + original.slice(-(allowance - Math.floor(allowance * .65) - 5)).trimStart()
  const providerPrompt = (description + "\n" + control).slice(0, 2000)

  return { providerPrompt, instrumental, genre, mood, intent }
}
