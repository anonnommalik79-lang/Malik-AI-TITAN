export type MusicGenreIntent = "phonk" | "trap" | "hiphop" | "lofi" | "edm" | "other"
export type MusicMoodIntent = "Агрессивный" | "Спокойный" | "Атмосферный" | "Энергичный" | "Грустный" | "Другое"

export type MusicPromptIntent = {
  instrumental?: boolean
  genre?: MusicGenreIntent
  mood?: MusicMoodIntent
  instruments: string[]
  providerHints: string[]
  explicit: boolean
}

const NO_VOCALS_RE = /(?:без\s+(?:слов|текста|вокала|голоса)|безвокал|инструментал(?:ьн\w*)?|только\s+(?:музык|мелоди|инструмент)|no\s+vocals?|without\s+vocals?|instrumental|music\s+only)/iu
const VOCALS_RE = /(?:с\s+(?:вокалом|голосом|текстом)|со\s+словами|песн(?:я|ю|и)|спой|вокал(?:ьн\w*)?|лирик\w*|lyrics?|vocals?|sing(?:ing)?|song|ән\b)/iu
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
  { re: /hip[ -]?hop|хип[ -]?хоп/iu, genre: "hiphop", hint: "Genre: hip-hop." },
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
  const instruments = INSTRUMENTS.filter((item) => item.re.test(prompt))
  const genre = GENRES.find((item) => item.re.test(prompt))
  const mood = MOODS.find((item) => item.re.test(prompt))

  const explicitlyNoVocals = NO_VOCALS_RE.test(prompt)
  const explicitlyVocals = VOCALS_RE.test(prompt)
  const genericMusic = GENERIC_INSTRUMENTAL_RE.test(prompt)

  let instrumental: boolean | undefined
  if (explicitlyNoVocals) instrumental = true
  else if (explicitlyVocals) instrumental = false
  else if (instruments.length > 0 || genericMusic) instrumental = true

  const providerHints = [
    ...instruments.map((item) => item.hint),
    genre?.hint || "",
    mood?.hint || "",
    instrumental === true ? "Instrumental only. No vocals, no spoken words, no singing." : "",
    instrumental === false ? "Vocal song. Include natural singing and respect the supplied lyrics/language." : "",
    "Follow the user's natural-language request over UI presets whenever they conflict.",
  ].filter(Boolean)

  return {
    instrumental,
    genre: genre?.genre,
    mood: mood?.mood,
    instruments: instruments.map((item) => item.name),
    providerHints,
    explicit: Boolean(explicitlyNoVocals || explicitlyVocals || instruments.length || genre || mood),
  }
}
