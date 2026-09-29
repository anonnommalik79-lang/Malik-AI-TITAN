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

console.log("music prompt intent checks passed")
