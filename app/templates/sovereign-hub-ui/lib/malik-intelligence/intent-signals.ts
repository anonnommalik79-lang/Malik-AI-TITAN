import type { IntentSignal } from "./types"

type SignalDef = { key: string; weight: number; re: RegExp }

export const SIGNALS: Record<string, SignalDef[]> = {
  image: [
    { key: "photo", weight: 0.32, re: /фото|photo|image|picture|изображ|картин/i },
    { key: "draw", weight: 0.22, re: /нарисуй|draw|арт|poster|обложк/i },
    { key: "visual-style", weight: 0.18, re: /cinematic|luxury|realistic|anime|style|стиль/i },
  ],
  video: [
    { key: "video", weight: 0.38, re: /видео|video|ролик|clip|кино|motion/i },
    { key: "camera", weight: 0.2, re: /camera|камера|pan|zoom|motion|движ/i },
    { key: "provider", weight: 0.18, re: /veo|luma|runway|kling|wan/i },
  ],
  code: [
    { key: "code", weight: 0.35, re: /код|code|program|script|function|component/i },
    { key: "lang", weight: 0.25, re: /react|tsx|python|javascript|typescript|go|rust|java|php|sql/i },
    { key: "debug", weight: 0.2, re: /ошиб|bug|debug|fix|исправ/i },
  ],
  website: [
    { key: "site", weight: 0.34, re: /сайт|website|landing|лендинг|page/i },
    { key: "ui", weight: 0.2, re: /ui|interface|интерфейс|dashboard|hero|pricing/i },
  ],
  presentation: [
    { key: "slides", weight: 0.4, re: /презентац|slides|deck|pitch/i },
  ],
  document: [
    { key: "doc", weight: 0.4, re: /документ|document|pdf|word|report|отч[её]т/i },
  ],
  agent: [
    { key: "agent", weight: 0.38, re: /agent|codex|агент|repo|repository|папк|файлы/i },
  ],
}

export function collectSignals(prompt: string, group: keyof typeof SIGNALS): IntentSignal[] {
  return SIGNALS[group].map((signal) => ({
    key: signal.key,
    weight: signal.weight,
    matched: signal.re.test(prompt),
  }))
}

export function signalScore(signals: IntentSignal[]) {
  return signals.reduce((sum, signal) => sum + (signal.matched ? signal.weight : 0), 0)
}

