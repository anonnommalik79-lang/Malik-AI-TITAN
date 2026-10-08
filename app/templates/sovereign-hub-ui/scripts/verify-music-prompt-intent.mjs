import assert from "node:assert/strict"
import { analyzeMusicPrompt, compileMusicBrief } from "../lib/media/music-intent.ts"

const piano = analyzeMusicPrompt("сгенерируй музыку грустную из пианино")
assert.equal(piano.instrumental, true)
assert.equal(piano.mood, "Грустный")
assert.deepEqual(piano.instruments, ["piano"])
assert.match(piano.providerHints.join(" "), /piano.*dominant/i)

const noWords = analyzeMusicPrompt("сделай спокойную музыку без слов")
assert.equal(noWords.instrumental, true)
assert.equal(noWords.mood, "Спокойный")

const vocal = analyzeMusicPrompt("сделай грустную песню с вокалом на русском")
assert.equal(vocal.instrumental, false)
assert.equal(vocal.mood, "Грустный")

const phonk = analyzeMusicPrompt("жесткий phonk трек")
assert.equal(phonk.genre, "phonk")
assert.equal(phonk.instrumental, true)

const explicitNoVocalsWins = analyzeMusicPrompt("песня без слов только пианино")
assert.equal(explicitNoVocalsWins.instrumental, true)
assert.deepEqual(explicitNoVocalsWins.instruments, ["piano"])



const rap = analyzeMusicPrompt("Напиши рэп трек с куплетами, припевом и мужским голосом, 95 BPM")
assert.equal(rap.instrumental, false)
assert.equal(rap.genre, "hiphop")
assert.equal(rap.bpm, 95)
assert.match(rap.providerHints.join(" "), /Male lead vocals/)
const rapBeat = analyzeMusicPrompt("Рэп бит без голоса 92 BPM")
assert.equal(rapBeat.instrumental, true)
assert.equal(rapBeat.bpm, 92)
const negative = analyzeMusicPrompt("Атмосферная музыка с пианино без барабанов")
assert.deepEqual(negative.instruments, ["piano"])
assert.deepEqual(negative.excludedInstruments, ["drums"])
assert.match(negative.providerHints.join(" "), /Do not include drums/)
const kazakh = analyzeMusicPrompt("Қазақша ән, әйел вокал")
assert.equal(kazakh.instrumental, false)

const customLyricsTrack = analyzeMusicPrompt("Мощный трек с женским голосом")
assert.equal(customLyricsTrack.vocalDirective, "vocal")
assert.equal(customLyricsTrack.instrumental, false)
const plainTrack = analyzeMusicPrompt("Создай трек с атмосферой ночного города")
assert.equal(plainTrack.vocalDirective, undefined)
const noVocalsSong = analyzeMusicPrompt("Песня без слов на пианино")
assert.equal(noVocalsSong.vocalDirective, "instrumental")

assert.equal(analyzeMusicPrompt("Сделай песню про Алматы").instrumental, false)
assert.equal(analyzeMusicPrompt("Қазақша ән жазып бер").instrumental, false)
console.log("music prompt intent checks passed")

const vocalTrackBrief = compileMusicBrief({
  prompt: "Лирический трек про Алматы", lyrics: "[Verse] Я верю в себя",
  requestedInstrumental: true, lyricsLanguage: "ru", genre: "other", mood: "Спокойный",
})
assert.equal(vocalTrackBrief.instrumental, false)
assert.match(vocalTrackBrief.providerPrompt, /STRICT: vocal song/)
assert.doesNotMatch(vocalTrackBrief.providerPrompt, /STRICT: instrumental composition/)
assert.match(vocalTrackBrief.providerPrompt, /Russian/)
const instrumentalTrackBrief = compileMusicBrief({
  prompt: "Инструментальная песня без слов, только гитара", lyrics: "ignore me",
  requestedInstrumental: false, lyricsLanguage: "kk",
})
assert.equal(instrumentalTrackBrief.instrumental, true)
assert.doesNotMatch(instrumentalTrackBrief.providerPrompt, /STRICT: vocal song/)
assert.match(instrumentalTrackBrief.providerPrompt, /no singing/)
const longPrompt = compileMusicBrief({
  prompt: "intro " + "нежная музыка ".repeat(160) + "БЕЗ БАРАБАНОВ",
  requestedInstrumental: true,
})
assert.ok(longPrompt.providerPrompt.length <= 2000)
assert.match(longPrompt.providerPrompt, /БЕЗ БАРАБАНОВ/)
assert.match(longPrompt.providerPrompt, /Do not include drums/)
const vocalOverride = compileMusicBrief({
  prompt: "Создай трек с вокалом, 105 BPM", requestedInstrumental: true,
})
assert.equal(vocalOverride.instrumental, false)
assert.equal(vocalOverride.intent.bpm, 105)
assert.doesNotMatch(vocalOverride.providerPrompt, /STRICT: instrumental composition/)
console.log("advanced music brief checks passed")
