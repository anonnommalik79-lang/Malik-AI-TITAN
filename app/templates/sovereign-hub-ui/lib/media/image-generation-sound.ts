"use client"

let lastStartedAt = 0
let activeContext: AudioContext | null = null
let sequenceResetTimer: number | null = null
let sequenceActive = false

const GENERATION_SEQUENCE_MS = 4900

function getAudioContextClass() {
  if (typeof window === "undefined") return null
  const scope = window as typeof window & { webkitAudioContext?: typeof AudioContext }
  return window.AudioContext || scope.webkitAudioContext || null
}

function makeNoiseBuffer(context: AudioContext, seconds: number) {
  const length = Math.max(1, Math.floor(context.sampleRate * seconds))
  const buffer = context.createBuffer(1, length, context.sampleRate)
  const data = buffer.getChannelData(0)
  for (let index = 0; index < data.length; index += 1) data[index] = Math.random() * 2 - 1
  return buffer
}

function scheduleScratch(context: AudioContext, startAt: number, duration: number) {
  const source = context.createBufferSource()
  const filter = context.createBiquadFilter()
  const gain = context.createGain()

  source.buffer = makeNoiseBuffer(context, Math.max(0.5, duration))
  source.loop = true
  filter.type = "bandpass"
  filter.frequency.value = 1750
  filter.Q.value = 0.8

  gain.gain.setValueAtTime(0.0001, startAt)
  gain.gain.exponentialRampToValueAtTime(0.017, startAt + 0.04)
  gain.gain.setValueAtTime(0.017, Math.max(startAt + 0.05, startAt + duration - 0.08))
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration)

  source.connect(filter)
  filter.connect(gain)
  gain.connect(context.destination)
  source.start(startAt)
  source.stop(startAt + duration + 0.03)
}

function scheduleSpray(context: AudioContext, startAt: number, duration: number) {
  const source = context.createBufferSource()
  const highPass = context.createBiquadFilter()
  const lowPass = context.createBiquadFilter()
  const gain = context.createGain()

  source.buffer = makeNoiseBuffer(context, Math.max(0.6, duration))
  source.loop = true
  highPass.type = "highpass"
  highPass.frequency.value = 720
  lowPass.type = "lowpass"
  lowPass.frequency.value = 4700

  gain.gain.setValueAtTime(0.0001, startAt)
  gain.gain.exponentialRampToValueAtTime(0.024, startAt + 0.04)
  gain.gain.setValueAtTime(0.024, Math.max(startAt + 0.05, startAt + duration - 0.08))
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration)

  source.connect(highPass)
  highPass.connect(lowPass)
  lowPass.connect(gain)
  gain.connect(context.destination)
  source.start(startAt)
  source.stop(startAt + duration + 0.03)
}

function scheduleMarkerClick(context: AudioContext, startAt: number) {
  const oscillator = context.createOscillator()
  const gain = context.createGain()
  oscillator.type = "sine"
  oscillator.frequency.setValueAtTime(780, startAt)
  oscillator.frequency.exponentialRampToValueAtTime(390, startAt + 0.08)
  gain.gain.setValueAtTime(0.0001, startAt)
  gain.gain.exponentialRampToValueAtTime(0.045, startAt + 0.012)
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.12)
  oscillator.connect(gain)
  gain.connect(context.destination)
  oscillator.start(startAt)
  oscillator.stop(startAt + 0.13)
}

function ensureContext() {
  const AudioContextClass = getAudioContextClass()
  if (!AudioContextClass) return null
  if (!activeContext || activeContext.state === "closed") activeContext = new AudioContextClass()
  return activeContext
}

/**
 * A restored/completed chat initially mounts with imageLoaded=false while the
 * browser decodes the already-generated image. The old implementation treated
 * that mount as a brand-new generation and replayed the waiting sound.
 *
 * If every currently-busy photo card already contains a real result <img>, we
 * are only hydrating/restoring finished history and must stay silent. A truly
 * new generation has a busy card without a result image, so it still plays.
 */
function isOnlyRestoringFinishedPhotoHistory() {
  if (typeof document === "undefined") return false
  const busyCards = Array.from(document.querySelectorAll<HTMLElement>('.malik-photo-motion[aria-busy="true"]'))
  if (!busyCards.length) return false
  return busyCards.every((card) => Boolean(card.querySelector('img.malik-art-result[src]')))
}

function scheduleArtSequence(context: AudioContext) {
  const startAt = context.currentTime + 0.025
  scheduleScratch(context, startAt, 1.55)
  scheduleMarkerClick(context, startAt + 1.72)
  scheduleScratch(context, startAt + 1.86, 0.72)
  scheduleSpray(context, startAt + 2.75, 1.75)
}

function markSequenceFinishedLater() {
  if (sequenceResetTimer !== null && typeof window !== "undefined") {
    window.clearTimeout(sequenceResetTimer)
  }
  if (typeof window === "undefined") return
  sequenceResetTimer = window.setTimeout(() => {
    sequenceActive = false
    sequenceResetTimer = null
  }, GENERATION_SEQUENCE_MS)
}

export function playImageGenerationStartSound() {
  if (typeof window === "undefined") return
  if (isOnlyRestoringFinishedPhotoHistory()) return

  const now = Date.now()
  // Several React effects can observe the same newly-created generation in the
  // same paint. Only the first one is allowed to start audio.
  if (sequenceActive || now - lastStartedAt < 500) return
  lastStartedAt = now

  const context = ensureContext()
  if (!context) return

  sequenceActive = true
  markSequenceFinishedLater()

  const play = () => scheduleArtSequence(context)
  if (context.state === "suspended") {
    void context.resume().then(play).catch(() => {
      sequenceActive = false
    })
  } else {
    play()
  }
}

/**
 * Completion is intentionally silent. The generation sound is a single start
 * sequence; reopening a finished chat, image decode, rerender and completion
 * must not produce another sound. The next NEW generation can play again.
 */
export function playImageGenerationCompleteSound() {
  // Intentionally no-op.
}
