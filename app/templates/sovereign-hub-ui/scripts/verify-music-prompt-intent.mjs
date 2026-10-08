import assert from "node:assert/strict"
import { analyzeMusicPrompt } from "../lib/media/music-intent.ts"

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
