import { deterministicGivens, needsAccuracyGate } from "./engine"

/**
 * A question whose answer is a computation: «Сколько будет 15% от 2400?»,
 * «Посчитай 0.1+0.2», a forecast, a logic puzzle. A number that merely sits
 * in the request («план на 7 дней», «топ 5 фильмов», «iPhone 17») is not one.
 */
export function isComputationalQuestion(question: string): boolean {
  const text = String(question || "").slice(0, 4000)
  // Keywords alone (no digit) already mark a numeric or scientific task.
  if (needsAccuracyGate(text.replace(/\d/gu, ""))) return true
  if (!/\d/u.test(text)) return false
  return /\d\s*(?:[+×*÷^=]|[-−/]\s*\d)|\d\s*%|[$€₸£]\s*\d|\d[\d\s.,]*\s*(?:тенге|тг|руб\p{L}*|доллар\p{L}*|евро|usd|kzt|rub|eur|млн|млрд|тыс)(?![\p{L}])/iu.test(text)
    || /(?<![\p{L}])(?:сколько|қанша|неше|how\s+(?:much|many)|чему\s+рав\p{L}+|реши|решить|найди\s+(?:x|корн|значени|сумм|площад|объ[её]м|скорост)\p{L}*|solve|sum|average|средн\p{L}+|сумм\p{L}+|умнож\p{L}*|раздел\p{L}*|плюс|минус|корень|степен\p{L}+|уравнени\p{L}*|формул\p{L}*)(?![\p{L}])/iu.test(text)
    || deterministicGivens(text).length > 0
}

/** Where an answer starts computing: an equation, arithmetic between numbers, or LaTeX math. */
const CLAIM = /\d[\d\s.,]*\s*(?:[+×*÷]\s*[-−]?\d|=)|=\s*[-−]?\d|≈\s*\d|\\\(|\\\[|\\frac|\\times|\$\$/u
/** A number at the very end of a chunk: what follows decides whether it starts a computation. */
const TRAILING_NUMBER = /\d[\d\s.,]{0,23}$/u

/**
 * No second output buffer. Computational turns publish only the checked final
 * content, while SSE activity/heartbeat continues. Everything else streams as
 * it is written: list numbers, years and sizes are prose, and holding them
 * back left the chat on «Думает…» until the whole answer existed. The stream
 * stops at the first computation the answer makes, and the checked final
 * snapshot takes over from there.
 */
export function accuracyTokenGate(question: string, emit?: (chunk: string) => void): ((chunk: string) => void) | undefined {
  if (!emit) return undefined
  // Code literals are not answer assertions; keep existing code streaming.
  const code = /^(?:напиши|создай|сделай|исправь|write|create|build|fix)\s+.{0,40}(?:код|скрипт|компонент|сайт|code|script|component|website|react|html)/iu.test(question)
  if (code) return chunk => emit(chunk)
  if (isComputationalQuestion(question)) return undefined
  let held = false
  let pending = ""
  return chunk => {
    if (held || !chunk) return
    const text = pending + chunk
    pending = ""
    const index = text.search(CLAIM)
    if (index >= 0) {
      if (index) emit(text.slice(0, index))
      held = true
      return
    }
    // «Итого 2» may continue as «+2=5» in the next chunk: keep the number back until it does not.
    const tail = TRAILING_NUMBER.exec(text)
    if (tail && tail.index > 0) {
      emit(text.slice(0, tail.index))
      pending = text.slice(tail.index)
    } else if (tail) pending = text
    else emit(text)
  }
}
