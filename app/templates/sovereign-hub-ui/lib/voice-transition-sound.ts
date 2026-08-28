"use client"

import { getVoiceAudioContext, unlockVoiceAudio } from "./voice/audio-playback"

const SOUND_STORAGE_KEY = "malik_voice_sound_enabled"

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
  if (typeof window === "undefined") return
  if (kind === "open") unlockVoiceAudio()
  if (!isVoiceSoundEnabled()) return
  try {
    const context = getVoiceAudioContext()
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
