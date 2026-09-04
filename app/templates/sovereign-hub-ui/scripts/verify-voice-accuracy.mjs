import assert from "node:assert/strict"

/**
 * The parts of Voice that are arithmetic, checked as arithmetic.
 *
 * Every claim here is measured rather than asserted: the filter is fed tones
 * and its attenuation is read off in decibels, the fusion is run over a
 * simulated corpus and its word error rate is compared with its own inputs, and
 * the phonetic distance is checked against the pairs it exists to separate.
 * A test that only checks that a function was called cannot tell whether any of
 * this made recognition better.
 */

async function load(file) {
  return import(`${process.cwd()}/${file}`)
}

let failures = 0
function check(name, fn) {
  try {
    const note = fn()
    console.log(`  ok  ${name}${note ? `  — ${note}` : ""}`)
  } catch (error) {
    failures += 1
    console.error(`  FAIL ${name}\n       ${String(error.message).split("\n")[0]}`)
  }
}

const { phoneticSimilarity, soundsTheSame, substitutionCost } = await load("lib/voice/phonetics.ts")
const { fuseTranscripts, words } = await load("lib/voice/rover.ts")
const dsp = await load("lib/voice/dsp.ts")

const db = (x) => 20 * Math.log10(Math.max(1e-12, x))

console.log("\nthe ruler: how far apart two words sound")

check("a Kazakh letter written as its Russian neighbour is barely a difference", () => {
  // қ→к, ң→н, ы/ы: this is a systematic transliteration, not a mistake, and it
  // is what a recognizer with any doubt produces on Kazakh.
  const score = phoneticSimilarity("қалайсың", "калайсын")
  assert.ok(score > 0.93, `only ${score.toFixed(3)}`)
  for (const [a, b] of [["қ", "к"], ["ғ", "г"], ["ң", "н"], ["ө", "о"], ["ү", "у"], ["і", "и"], ["ә", "а"]]) {
    assert.ok(substitutionCost(a, b) <= 0.05, `${a}/${b} costs ${substitutionCost(a, b)}`)
  }
  return `қалайсың≈калайсын ${score.toFixed(3)}`
})

check("it separates the pair a character count could not", () => {
  // This is why the old repair had to be limited to a single edit and therefore
  // caught almost nothing: "плошадка" and "посадка" are both close to
  // "площадка" by characters, and only one of them is the same word.
  const heard = phoneticSimilarity("площадка", "плошадка")
  const other = phoneticSimilarity("площадка", "посадка")
  assert.ok(heard >= 0.82, `misheard form scored ${heard.toFixed(3)} and would be rejected`)
  assert.ok(other < 0.82, `a different word scored ${other.toFixed(3)} and would be rewritten`)
  assert.equal(soundsTheSame("площадка", "плошадка"), true)
  assert.equal(soundsTheSame("площадка", "посадка"), false)
  return `${heard.toFixed(3)} vs ${other.toFixed(3)}`
})

check("voicing pairs cost less than unrelated consonants", () => {
  // б/п differ by one feature and are swapped constantly; б/щ share nothing.
  for (const [a, b] of [["б", "п"], ["д", "т"], ["г", "к"], ["з", "с"], ["ж", "ш"]]) {
    assert.ok(substitutionCost(a, b) <= 0.2)
  }
  assert.ok(substitutionCost("б", "щ") > 0.6)
  assert.ok(substitutionCost("о", "а") < substitutionCost("о", "щ"))
})

console.log("\nthe vote: three recognizers, word by word")

check("two agreeing recognizers outvote the third", () => {
  const fused = fuseTranscripts([
    { text: "сделай мне сайт для кофейни", weight: 0.8, source: "stream" },
    { text: "сделай мне сайт для кофейни", weight: 0.7, source: "whisper" },
    { text: "сделай мне свет для кофейни", weight: 0.9, source: "browser" },
  ])
  assert.equal(fused.text, "сделай мне сайт для кофейни")
  assert.ok(fused.agreement > 0.85, `agreement ${fused.agreement.toFixed(2)}`)
  return "the confident wrong one is outvoted"
})

check("the same word heard two ways shares one vote", () => {
  // Without a phonetic alignment "площадка" and "плошадка" land in different
  // slots and split the vote they should have shared, letting a third reading
  // win with a minority.
  const fused = fuseTranscripts([
    { text: "эта площадка работает", weight: 0.7, source: "stream" },
    { text: "эта плошадка работает", weight: 0.6, source: "whisper" },
    { text: "эта посадка работает", weight: 0.9, source: "browser" },
  ])
  assert.match(fused.text, /площадка|плошадка/)
  assert.doesNotMatch(fused.text, /посадка/)
})

check("a word only one recognizer heard does not get in on its own", () => {
  const fused = fuseTranscripts([
    { text: "привет как дела", weight: 0.6, source: "stream" },
    { text: "привет как дела", weight: 0.6, source: "whisper" },
    { text: "привет как твои дела сегодня", weight: 0.5, source: "browser" },
  ])
  assert.equal(words(fused.text).length, 3, `got "${fused.text}"`)
})

check("fusion beats every one of its inputs, measured", () => {
  // A corpus, three recognizers, and errors made independently - which is the
  // real situation, since these three are different architectures trained on
  // different data. The claim being tested is the whole reason this file
  // exists: the vote is better than the best voter.
  const truth = [
    "сделай мне сайт для кофейни в алматы",
    "почему деплой падает по памяти на рендере",
    "расскажи чем отличается клод от чат гпт",
    "добавь генерацию фото в высоком качестве",
    "как работает эта площадка и сколько стоит",
    "переделай короче и без списка пожалуйста",
    "покажи что ты уже сделал в этом проекте",
    "мне нужно чтобы голос понимал казахский",
  ]

  // A deterministic generator, so a green run is a green run and not luck.
  let seed = 20260904
  const random = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    return seed / 0x7fffffff
  }

  const confusable = { о: "а", е: "и", б: "п", д: "т", г: "к", з: "с", ж: "ш", щ: "ш", ц: "с", й: "и" }
  function corrupt(sentence, rate) {
    return words(sentence).map((word) => {
      if (random() > rate) return word
      const roll = random()
      if (roll < 0.45) {
        // A sound confusion - the mistake recognizers actually make.
        const letters = word.split("")
        const positions = letters.map((c, i) => (confusable[c] ? i : -1)).filter((i) => i >= 0)
        if (positions.length) {
          const at = positions[Math.floor(random() * positions.length)]
          letters[at] = confusable[letters[at]]
          return letters.join("")
        }
        return word
      }
      if (roll < 0.75) return word.slice(0, Math.max(2, word.length - 2)) // a dropped ending
      if (roll < 0.9) return "" // a dropped word
      return `${word} ну` // an inserted filler
    }).filter(Boolean).join(" ")
  }

  function wer(reference, hypothesis) {
    const a = words(reference)
    const b = words(hypothesis)
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
    for (let j = 0; j <= b.length; j++) d[0][j] = j
    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
      }
    }
    return d[a.length][b.length] / Math.max(1, a.length)
  }

  const totals = { stream: 0, whisper: 0, browser: 0, fused: 0 }
  const runs = 40
  for (let run = 0; run < runs; run++) {
    for (const sentence of truth) {
      const hypotheses = [
        { text: corrupt(sentence, 0.18), weight: 0.75, source: "stream" },
        { text: corrupt(sentence, 0.22), weight: 0.6, source: "whisper" },
        { text: corrupt(sentence, 0.26), weight: 0.55, source: "browser" },
      ]
      for (const h of hypotheses) totals[h.source] += wer(sentence, h.text)
      totals.fused += wer(sentence, fuseTranscripts(hypotheses).text)
    }
  }

  const n = runs * truth.length
  const rates = Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, v / n]))
  const bestSingle = Math.min(rates.stream, rates.whisper, rates.browser)

  assert.ok(rates.fused < bestSingle,
    `fused ${(rates.fused * 100).toFixed(1)}% is not better than the best single ${(bestSingle * 100).toFixed(1)}%`)
  const gain = (1 - rates.fused / bestSingle) * 100
  assert.ok(gain > 8, `only ${gain.toFixed(1)}% better - not worth the alignment`)
  return `WER ${(bestSingle * 100).toFixed(1)}% → ${(rates.fused * 100).toFixed(1)}%, ${gain.toFixed(0)}% fewer errors`
})

console.log("\nthe signal: what actually reaches the recognizer")

function tone(hz, rate, samples) {
  const out = new Float32Array(samples)
  for (let i = 0; i < samples; i++) out[i] = Math.sin((2 * Math.PI * hz * i) / rate)
  return out
}
function rms(x) {
  let sum = 0
  for (let i = 0; i < x.length; i++) sum += x[i] * x[i]
  return Math.sqrt(sum / x.length)
}

check("the low-pass is designed, and hits the attenuation it was asked for", () => {
  const rate = 48000
  // 1kHz is speech and must survive; 15kHz is above the new 8kHz Nyquist and
  // would fold back into the speech band as hiss the recognizer hears as
  // consonants.
  const pass = new dsp.Resampler(rate, 16000).process(tone(1000, rate, 48000))
  const stop = new dsp.Resampler(rate, 16000).process(tone(15000, rate, 48000))
  const passDb = db(rms(pass) / rms(tone(1000, rate, 48000)))
  const stopDb = db(rms(stop) / rms(tone(15000, rate, 48000)))
  assert.ok(passDb > -1.5, `speech attenuated by ${(-passDb).toFixed(1)}dB`)
  assert.ok(stopDb < -55, `aliasing only ${(-stopDb).toFixed(1)}dB down`)
  return `speech ${passDb.toFixed(1)}dB, aliasing ${stopDb.toFixed(0)}dB`
})

check("it beats the box average it replaced, by a lot", () => {
  // The old code averaged every three samples. That is a low-pass with a first
  // sidelobe 13dB down, so a third of the out-of-band energy came through.
  const rate = 48000
  const input = tone(15000, rate, 48000)
  const boxed = new Float32Array(Math.floor(input.length / 3))
  for (let i = 0; i < boxed.length; i++) boxed[i] = (input[3 * i] + input[3 * i + 1] + input[3 * i + 2]) / 3
  const designed = new dsp.Resampler(rate, 16000).process(input)
  const before = db(rms(boxed) / rms(input))
  const after = db(rms(designed) / rms(input))
  assert.ok(after < before - 25, `only ${(before - after).toFixed(1)}dB better`)
  return `${before.toFixed(0)}dB → ${after.toFixed(0)}dB, ${(before - after).toFixed(0)}dB less aliasing`
})

check("the filter keeps its state across blocks", () => {
  // Audio arrives in 2048-sample blocks. A filter reset at every boundary puts
  // a step at each one - 23 clicks a second going into the recognizer.
  const rate = 48000
  const full = tone(1000, rate, 2048 * 8)
  const resampler = new dsp.Resampler(rate, 16000)
  const pieces = []
  for (let i = 0; i < full.length; i += 2048) pieces.push(resampler.process(full.subarray(i, i + 2048)))
  const joined = Float32Array.from(pieces.flatMap((p) => Array.from(p)))
  // A 1kHz tone at 16kHz moves at most 0.4 between neighbouring samples. A
  // discontinuity at a boundary shows up as a jump far larger than that.
  let worst = 0
  for (let i = resampler.length; i < joined.length - 1; i++) {
    worst = Math.max(worst, Math.abs(joined[i + 1] - joined[i]))
  }
  assert.ok(worst < 0.55, `a jump of ${worst.toFixed(2)} between samples - that is a click`)
  return `largest step ${worst.toFixed(3)}`
})

check("pre-emphasis lifts consonants over vowels", () => {
  // Speech loses about 6dB per octave on the way out of a mouth, so the
  // consonants that tell words apart are quieter than the vowels that do not.
  const rate = 16000
  const low = db(rms(new dsp.PreEmphasis().process(tone(300, rate, 16000))))
  const high = db(rms(new dsp.PreEmphasis().process(tone(4000, rate, 16000))))
  assert.ok(high - low > 10, `only ${(high - low).toFixed(1)}dB of tilt`)
  return `${(high - low).toFixed(1)}dB tilt toward fricatives`
})

check("the DC blocker removes an offset and leaves speech alone", () => {
  const rate = 16000
  const offset = tone(300, rate, 16000).map((v) => v + 0.4)
  const cleaned = new dsp.DcBlocker().process(Float32Array.from(offset))
  const mean = cleaned.reduce((a, b) => a + b, 0) / cleaned.length
  assert.ok(Math.abs(mean) < 0.01, `offset ${mean.toFixed(3)} survived`)
  assert.ok(rms(cleaned) > 0.65, `the tone lost too much: ${rms(cleaned).toFixed(2)}`)
})

check("spectral flatness tells a fan from a voice", () => {
  // A level meter cannot: loudness that ignores a fan also ignores a quiet
  // speaker. Flatness separates them by the shape of the spectrum instead.
  const noise = Array.from({ length: 256 }, () => 0.5 + Math.random())
  const voiced = Array.from({ length: 256 }, (_, i) => (i % 24 === 0 ? 8 : 0.02))
  const flatNoise = dsp.spectralFlatness(noise)
  const flatVoice = dsp.spectralFlatness(voiced)
  assert.ok(flatNoise > 0.7, `noise measured ${flatNoise.toFixed(2)}`)
  assert.ok(flatVoice < 0.25, `a peaky spectrum measured ${flatVoice.toFixed(2)}`)
  return `noise ${flatNoise.toFixed(2)}, voice ${flatVoice.toFixed(2)}`
})

console.log("\nthe endpoint: this speaker's own pauses")

check("it learns how long this person pauses", () => {
  const tracker = new dsp.PauseTracker()
  // Nothing measured yet: the safe middle of the range.
  const initial = tracker.endpointMs()
  assert.ok(initial > 900 && initial < 1400, `started at ${initial}`)

  // Someone who pauses for about 900ms while choosing words.
  let now = 0
  for (let i = 0; i < 40; i++) {
    now += 850 + (i % 5) * 40
    tracker.mark(now)
  }
  const slow = tracker.endpointMs()
  assert.ok(slow > initial, `${slow} is not longer than ${initial} for a slow speaker`)
  assert.ok(slow <= 1750, `${slow} exceeds the ceiling`)

  // And someone quick.
  const quick = new dsp.PauseTracker()
  now = 0
  for (let i = 0; i < 40; i++) {
    now += 200 + (i % 3) * 20
    quick.mark(now)
  }
  assert.ok(quick.endpointMs() < slow, "a quick speaker should not wait as long as a slow one")
  assert.ok(quick.endpointMs() >= 620, "but never so short that a comma ends the turn")
  return `slow ${slow}ms, quick ${quick.endpointMs()}ms`
})

check("an end of turn is not counted as a pause", () => {
  // Otherwise the estimate grows every turn until it never fires.
  const tracker = new dsp.PauseTracker()
  let now = 0
  for (let i = 0; i < 30; i++) { now += 400; tracker.mark(now) }
  const before = tracker.endpointMs()
  now += 9000
  tracker.mark(now)
  assert.equal(tracker.endpointMs(), before, "a nine-second gap changed the estimate")
})

console.log(failures ? `\n${failures} failing\n` : "\nall voice accuracy checks passed\n")
process.exit(failures ? 1 : 0)
