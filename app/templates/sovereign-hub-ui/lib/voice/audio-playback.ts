"use client"

let sharedContext: AudioContext | null = null

/** One output context, unlocked by the same gesture that opens Voice Mode. */
export function getVoiceAudioContext() {
  if (typeof window === "undefined") return null
  const Context = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Context) return null
  if (!sharedContext || sharedContext.state === "closed") sharedContext = new Context()
  return sharedContext
}

export function unlockVoiceAudio() {
  try {
    const context = getVoiceAudioContext()
    if (!context) return
    // Call resume synchronously inside the gesture, not after fetching TTS.
    void context.resume().catch(() => {})
    const source = context.createBufferSource()
    source.buffer = context.createBuffer(1, 1, context.sampleRate)
    source.connect(context.destination)
    source.onended = () => source.disconnect()
    source.start()
  } catch { /* A visible retry is offered if the browser still blocks audio. */ }
}

export async function readyVoiceAudio(context: AudioContext) {
  if (context.state === "running") return true
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      context.resume(),
      new Promise<void>((resolve) => { timer = setTimeout(resolve, 1800) }),
    ])
    return (context.state as string) === "running"
  } catch { return false }
  finally { clearTimeout(timer) }
}

/** Owns only reply audio. Stopping a reply never closes the shared output context. */
export class VoiceAudioPlayer {
  private cancel: (() => void) | null = null

  stop() {
    this.cancel?.()
    this.cancel = null
  }

  play(blob: Blob, onStarted?: () => void): Promise<boolean> {
    this.stop()
    return new Promise((resolve) => {
      let settled = false
      let source: AudioBufferSourceNode | null = null
      const finish = (ok: boolean) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        if (source) {
          source.onended = null
          try { source.stop(); source.disconnect() } catch {}
        }
        if (this.cancel === cancel) this.cancel = null
        resolve(ok)
      }
      const cancel = () => finish(false)
      this.cancel = cancel
      const timer = setTimeout(cancel, 120000)
      void (async () => {
        try {
          if (blob.size <= 128) return finish(false)
          const context = getVoiceAudioContext()
          if (!context || !await readyVoiceAudio(context) || settled) return finish(false)
          const audio = await context.decodeAudioData(await blob.arrayBuffer())
          if (settled) return
          if (!audio.length || !audio.duration || !await readyVoiceAudio(context)) return finish(false)
          if (settled) return
          source = context.createBufferSource()
          source.buffer = audio
          source.connect(context.destination)
          source.onended = () => finish(true)
          source.start()
          onStarted?.()
        } catch { finish(false) }
      })()
    })
  }
}
