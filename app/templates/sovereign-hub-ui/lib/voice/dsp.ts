/**
 * The signal, before anyone tries to recognise it.
 *
 * A recognizer is only ever as good as what reaches it, and what reached it
 * here was damaged in three ways before it left the browser - each of which
 * shows up as words that were never said.
 *
 * The resampling was a box average: to go from 48kHz to 16kHz it averaged every
 * three samples. That is a low-pass filter, but a bad one - its first sidelobe
 * is only 13dB down, so a third of the energy above 8kHz survives the
 * "filtering" and folds back into the speech band. Folded-back energy lands
 * where fricatives live, and a recognizer hears it as с, ш, ф, х that nobody
 * pronounced. A windowed-sinc filter puts that at 74dB instead, which is
 * silence.
 *
 * There was no filter state between callbacks. The audio arrives in 2048-sample
 * blocks and each was filtered as if the ones around it did not exist, so every
 * block boundary produced a discontinuity - 23 clicks a second, evenly spaced,
 * straight into the recognizer.
 *
 * What is deliberately NOT here is pre-emphasis. Every ASR front end applies it
 * - and that is the point: the recognizer at the other end of this socket
 * applies its own. Tilting the signal before sending it means the tilt is
 * applied twice, and a 440Hz tone measured 24dB down on the way out, which is
 * most of a vowel's energy thrown away before anyone tried to recognise it. It
 * belongs inside a local feature extractor, and there is no local feature
 * extractor here.
 */

/**
 * Removes the microphone's DC offset.
 *
 * A cheap capacitor leaves the whole waveform sitting slightly off zero. It is
 * inaudible, it costs headroom on every sample, and it puts a step at the start
 * of every utterance that the filters below then ring on.
 *
 * y[n] = x[n] - x[n-1] + R*y[n-1], a one-pole high-pass at about 4Hz for
 * R = 0.995 at 48kHz - far below anything anyone can say.
 */
export class DcBlocker {
  private lastIn = 0
  private lastOut = 0
  private readonly r: number
  constructor(r = 0.995) { this.r = r }

  process(input: Float32Array): Float32Array {
    const out = new Float32Array(input.length)
    for (let i = 0; i < input.length; i++) {
      const x = input[i]
      const y = x - this.lastIn + this.r * this.lastOut
      this.lastIn = x
      this.lastOut = y
      out[i] = y
    }
    return out
  }
}

/** Zeroth-order modified Bessel function, for the Kaiser window. */
function besselI0(x: number): number {
  let sum = 1
  let term = 1
  for (let k = 1; k < 40; k++) {
    term *= (x / (2 * k)) * (x / (2 * k))
    sum += term
    if (term < 1e-12 * sum) break
  }
  return sum
}

/**
 * A windowed-sinc low-pass, designed rather than guessed.
 *
 * Kaiser's formulas give the two things that matter from one number: for a
 * stopband attenuation A in dB, beta = 0.1102(A - 8.7), and the number of taps
 * needed for a transition width dw is (A - 8) / (2.285 dw). Ask for 74dB and
 * the design tells you what it costs; the box average this replaces cannot be
 * asked for anything.
 */
export function designLowPass(cutoff: number, attenuationDb = 74, transition = 0.06): Float32Array {
  const beta = attenuationDb > 50
    ? 0.1102 * (attenuationDb - 8.7)
    : attenuationDb >= 21
      ? 0.5842 * Math.pow(attenuationDb - 21, 0.4) + 0.07886 * (attenuationDb - 21)
      : 0

  let taps = Math.ceil((attenuationDb - 8) / (2.285 * (2 * Math.PI * transition))) + 1
  if (taps % 2 === 0) taps += 1 // odd, so the filter has a exact centre and linear phase

  const h = new Float32Array(taps)
  const mid = (taps - 1) / 2
  const denominator = besselI0(beta)
  let sum = 0

  for (let n = 0; n < taps; n++) {
    const k = n - mid
    // sinc, with the removable singularity at the centre filled in
    const sinc = k === 0 ? 2 * cutoff : Math.sin(2 * Math.PI * cutoff * k) / (Math.PI * k)
    const ratio = (2 * n) / (taps - 1) - 1
    const window = besselI0(beta * Math.sqrt(Math.max(0, 1 - ratio * ratio))) / denominator
    h[n] = sinc * window
    sum += h[n]
  }
  // Unity gain at DC, so the filter changes the bandwidth and not the volume.
  for (let n = 0; n < taps; n++) h[n] /= sum
  return h
}

/**
 * Resamples a continuous stream to a lower rate, keeping its filter state.
 *
 * The filter runs at the input rate and the output is read off at fractional
 * positions, which handles the awkward ratios - 44100 to 16000 is 2.75625, and
 * a lot of hardware is 44100. Because everything above the new Nyquist is 74dB
 * down by the time the interpolation happens, reading between samples is
 * accurate rather than a second source of error.
 */
export class Resampler {
  private readonly taps: Float32Array
  private readonly history: Float32Array
  private position = 0
  private readonly ratio: number

  private readonly from: number
  private readonly to: number

  constructor(from: number, to: number, attenuationDb = 74) {
    this.from = from
    this.to = to
    this.ratio = from / to
    // Cut at 45% of the output rate: below the new Nyquist with room for the
    // transition band to roll off inside.
    const cutoff = Math.min(0.45, (0.45 * to) / from)
    this.taps = designLowPass(cutoff, attenuationDb)
    this.history = new Float32Array(this.taps.length)
  }

  get length() {
    return this.taps.length
  }

  process(input: Float32Array): Float32Array {
    if (this.from === this.to) return input

    // The tail of the previous block in front of this one, so the filter sees a
    // continuous signal and no boundary exists to click on.
    const padded = new Float32Array(this.history.length + input.length)
    padded.set(this.history, 0)
    padded.set(input, this.history.length)

    const taps = this.taps
    const filtered = new Float32Array(input.length)
    for (let i = 0; i < input.length; i++) {
      let acc = 0
      const base = i + this.history.length
      for (let k = 0; k < taps.length; k++) acc += taps[k] * padded[base - k]
      filtered[i] = acc
    }
    this.history.set(padded.subarray(padded.length - this.history.length))

    const out: number[] = []
    let p = this.position
    while (p < filtered.length - 1) {
      const index = Math.floor(p)
      const frac = p - index
      out.push(filtered[index] * (1 - frac) + filtered[index + 1] * frac)
      p += this.ratio
    }
    this.position = p - filtered.length
    if (this.position < 0) this.position = 0

    return Float32Array.from(out)
  }
}

/**
 * How noise-like a block of audio is, from 0 to 1.
 *
 * Spectral flatness - the ratio of the geometric mean of the spectrum to its
 * arithmetic mean - is near 1 for a flat spectrum and near 0 for one with
 * strong peaks. Speech is peaky: it has a fundamental and formants. A fan, a
 * road, a fridge, an air conditioner are flat.
 *
 * This is what the level meter could never do. Loudness cannot tell speech from
 * a noisy room, so the threshold that ignores a fan also ignores a quiet
 * speaker; flatness separates them by shape instead, and the two together are
 * what makes the endpoint honest.
 */
export function spectralFlatness(magnitudes: ArrayLike<number>): number {
  let logSum = 0
  let sum = 0
  let count = 0
  for (let i = 1; i < magnitudes.length; i++) {
    const value = Math.max(1e-10, magnitudes[i])
    logSum += Math.log(value)
    sum += value
    count += 1
  }
  if (!count || sum <= 0) return 1
  const geometric = Math.exp(logSum / count)
  const arithmetic = sum / count
  return Math.min(1, geometric / arithmetic)
}

/**
 * How long this person pauses inside a sentence.
 *
 * The end of a turn was a constant - 1700ms - and a constant is wrong for
 * everybody. Someone speaking their first language pauses for 300ms between
 * clauses; someone choosing words in their third pauses for over a second, and
 * the setting that does not cut them off makes the first person wait an age for
 * every reply.
 *
 * So it is measured. Gaps between words are collected, and the endpoint is set
 * at the 90th percentile of this speaker's own pauses - long enough that nine
 * pauses in ten are not mistaken for an ending, and no longer than that.
 */
export class PauseTracker {
  private gaps: number[] = []
  private lastWordAt = 0

  private readonly floorMs: number
  private readonly ceilingMs: number
  private readonly percentile: number

  constructor(floorMs = 620, ceilingMs = 1750, percentile = 0.9) {
    this.floorMs = floorMs
    this.ceilingMs = ceilingMs
    this.percentile = percentile
  }

  /** Call when a word is recognised. */
  mark(now = Date.now()) {
    if (this.lastWordAt) {
      const gap = now - this.lastWordAt
      // Anything above the ceiling was an actual end of turn, not a pause, and
      // feeding it back in would make the estimate grow without limit.
      if (gap > 60 && gap < this.ceilingMs) {
        this.gaps.push(gap)
        if (this.gaps.length > 60) this.gaps.shift()
      }
    }
    this.lastWordAt = now
  }

  /** Call when a turn ends, so the next turn's first word is not a gap. */
  reset() {
    this.lastWordAt = 0
  }

  /** Milliseconds of silence that mean the person has finished. */
  endpointMs(): number {
    // Under about a dozen samples the estimate is noise; the default is the
    // safe end of the range until there is enough to say otherwise.
    if (this.gaps.length < 12) return Math.round((this.floorMs + this.ceilingMs) / 2)
    const sorted = [...this.gaps].sort((a, b) => a - b)
    const index = Math.min(sorted.length - 1, Math.floor(sorted.length * this.percentile))
    // A margin over the ninetieth percentile, because being early costs half a
    // question and being late costs a moment.
    const value = sorted[index] * 1.35
    return Math.round(Math.max(this.floorMs, Math.min(this.ceilingMs, value)))
  }

  get samples() {
    return this.gaps.length
  }
}
