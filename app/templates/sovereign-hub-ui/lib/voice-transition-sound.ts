"use client"

const SOUND_STORAGE_KEY = "malik_voice_sound_enabled"

let sharedContext: AudioContext | null = null
let mediaFallbackInstalled = false

type AudioWindow = Window & typeof globalThis & {
  webkitAudioContext?: typeof AudioContext
}

function getSharedContext() {
  const audioWindow = window as AudioWindow
  const Context = window.AudioContext || audioWindow.webkitAudioContext
  if (!Context) return null
  const context = sharedContext && sharedContext.state !== "closed" ? sharedContext : new Context()
  sharedContext = context
  return context
}

/**
 * Mobile Safari can allow the opening chime (direct user gesture) but later
 * reject HTMLAudioElement.play() after the async TTS request finishes. Voice
 * Mode used to swallow that rejection, which left a perfectly valid xAI audio
 * blob completely silent.
 *
 * Reuse the AudioContext unlocked by the opening chime. If native media
 * playback is rejected for a blob URL, decode that exact blob with WebAudio
 * and dispatch the normal `ended` event so VoiceMode continues its turn loop.
 */
function installBlobAudioFallback() {
  if (mediaFallbackInstalled || typeof HTMLMediaElement === "undefined") return
  mediaFallbackInstalled = true

  const prototype = HTMLMediaElement.prototype
  const nativePlay = prototype.play

  prototype.play = function patchedVoicePlay(...args: Parameters<HTMLMediaElement["play"]>) {
    const media = this
    return nativePlay.apply(media, args).catch(async (nativeError) => {
      const sourceUrl = media.currentSrc || media.src || ""
      if (!sourceUrl.startsWith("blob:")) throw nativeError

      const context = getSharedContext()
      if (!context) throw nativeError

      try {
        if (context.state === "suspended") await context.resume()
        const response = await fetch(sourceUrl, { cache: "no-store" })
        if (!response.ok) throw new Error(`voice blob fetch failed: ${response.status}`)
        const encoded = await response.arrayBuffer()
        if (encoded.byteLength < 128) throw new Error("voice blob is empty")

        const decoded = await context.decodeAudioData(encoded.slice(0))
        const node = context.createBufferSource()
        const gain = context.createGain()
        node.buffer = decoded
        node.playbackRate.value = Number.isFinite(media.playbackRate) ? Math.max(.5, Math.min(2, media.playbackRate)) : 1
        gain.gain.value = media.muted ? 0 : (Number.isFinite(media.volume) ? Math.max(0, Math.min(1, media.volume)) : 1)
        node.connect(gain)
        gain.connect(context.destination)
        node.onended = () => media.dispatchEvent(new Event("ended"))
        node.start()
      } catch (fallbackError) {
        // Let VoiceMode's existing error path finish instead of hanging forever.
        queueMicrotask(() => media.dispatchEvent(new Event("error")))
        throw fallbackError
      }
    })
  }
}

export function isVoiceSoundEnabled() {
  if (typeof window === "undefined") return true
  try {
    return window.localStorage.getItem(SOUND_STORAGE_KEY) !== "false"
  } catch {
    return true
  }
}

export function saveVoiceSoundEnabled(enabled: boolean) {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(SOUND_STORAGE_KEY, String(enabled))
  } catch {}
}

export function playVoiceTransitionSound(kind: "open" | "close") {
  if (typeof window === "undefined" || !isVoiceSoundEnabled()) return
  try {
    installBlobAudioFallback()
    const context = getSharedContext()
    if (!context) return
    void context.resume()

    const now = context.currentTime
    const duration = kind === "open" ? .54 : .42
    const master = context.createGain()
    const filter = context.createBiquadFilter()
    filter.type = "lowpass"
    filter.frequency.setValueAtTime(kind === "open" ? 3400 : 2500, now)
    filter.Q.setValueAtTime(.65, now)
    master.gain.setValueAtTime(.0001, now)
    master.gain.exponentialRampToValueAtTime(kind === "open" ? .075 : .058, now + .055)
    master.gain.exponentialRampToValueAtTime(.0001, now + duration)
    filter.connect(master)
    master.connect(context.destination)

    const tones = kind === "open"
      ? [{ from: 392, to: 587, gain: .72 }, { from: 659, to: 880, gain: .26 }]
      : [{ from: 587, to: 349, gain: .62 }, { from: 784, to: 523, gain: .22 }]

    tones.forEach((tone, index) => {
      const oscillator = context.createOscillator()
      const toneGain = context.createGain()
      oscillator.type = index === 0 ? "sine" : "triangle"
      oscillator.frequency.setValueAtTime(tone.from, now)
      oscillator.frequency.exponentialRampToValueAtTime(tone.to, now + duration * .82)
      toneGain.gain.setValueAtTime(tone.gain, now)
      toneGain.gain.exponentialRampToValueAtTime(.0001, now + duration)
      oscillator.connect(toneGain)
      toneGain.connect(filter)
      oscillator.start(now)
      oscillator.stop(now + duration + .02)
    })
  } catch {
    // Audio feedback is enhancement-only; Voice Mode must still open and close.
  }
}
