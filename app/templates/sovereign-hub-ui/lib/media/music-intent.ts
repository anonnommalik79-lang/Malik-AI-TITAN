export type MusicGenreIntent = "phonk" | "trap" | "hiphop" | "lofi" | "edm" | "other"
export type MusicMoodIntent = "Агрессивный" | "Спокойный" | "Атмосферный" | "Энергичный" | "Грустный" | "Другое"

export type MusicPromptIntent = {
  instrumental?: boolean
  vocalDirective?: "instrumental" | "vocal"
  genre?: MusicGenreIntent
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
  const match = re.exec(prompt)
  if (!match || match.index === undefined) return false
  const phrase = prompt.slice(Math.max(0, match.index - 42), match.index).split(/[,.!?;\n]/).pop() || ""
  return /(?:без|никаких|избегай|исключи|without|no|avoid|exclude)\s+(?:[\p{L}\s-]{0,35})$/iu.test(phrase)
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
  const mood = MOODS.find((item) => item.re.test(prompt))

  const explicitlyNoVocals = NO_VOCALS_RE.test(prompt)
  const explicitlyVocals = VOCALS_RE.test(prompt) || /(?:женск\w*|мужск\w*)\s+(?:голос|вокал)|(?:female|male)\s+(?:lead\s+)?vocals?/iu.test(prompt)
  const genericMusic = GENERIC_INSTRUMENTAL_RE.test(prompt)

  let instrumental: boolean | undefined
  if (explicitlyNoVocals) instrumental = true
  else if (explicitlyVocals && !BEAT_ONLY_RE.test(prompt)) instrumental = false
  else if (BEAT_ONLY_RE.test(prompt)) instrumental = true
  else if (RAP_RE.test(prompt)) instrumental = false
  else if (explicitlyVocals) instrumental = false
  else if (instruments.length > 0 || genericMusic) instrumental = true

  const vocalDirective = explicitlyNoVocals ? "instrumental" as const
    : explicitlyVocals && !BEAT_ONLY_RE.test(prompt) ? "vocal" as const
    : BEAT_ONLY_RE.test(prompt) ? "instrumental" as const
    : RAP_RE.test(prompt) ? "vocal" as const : undefined
  const bpm = requestedBpm(prompt)
  const vocalCharacter = /женск\w*\s+(?:голос|вокал)|female\s+vocals?/iu.test(prompt)
    ? "Female lead vocals." : /мужск\w*\s+(?:голос|вокал)|male\s+vocals?/iu.test(prompt)
      ? "Male lead vocals." : ""

  const providerHints = [
    ...instruments.map((item) => item.hint),
    ...excludedInstruments.map((item) => `Do not include ${item.name}.`),
    bpm ? `Target tempo: ${bpm} BPM.` : "",
    vocalCharacter,
    genre?.hint || "",
    mood?.hint || "",
    instrumental === true ? "Instrumental only. No vocals, no spoken words, no singing." : "",
    instrumental === false ? "Vocal song. Include natural singing and respect the supplied lyrics/language." : "",
  ].filter(Boolean)

  return {
    instrumental,
    vocalDirective,
    genre: genre?.genre,
    mood: mood?.mood,
    instruments: instruments.map((item) => item.name),
    excludedInstruments: excludedInstruments.map((item) => item.name),
    bpm,
    providerHints,
    explicit: Boolean(explicitlyNoVocals || explicitlyVocals || RAP_RE.test(prompt) || instruments.length || excludedInstruments.length || genre || mood || bpm),
  }
}
