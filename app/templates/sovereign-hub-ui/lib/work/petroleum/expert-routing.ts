/**
 * A routine rate table has a fast verified report. Broad petroleum engineering
 * assignments must also use the explicitly selected reasoning model.
 * Do not gate on elapsed time: this is an intent/capability decision.
 */
export function requiresPetroleumExpertSynthesis(prompt: string): boolean {
  const text = String(prompt || "").slice(0, 120_000)
  if (/\b(?:petroleum|oil|uae|нефтегазов)\s+(?:engineering\s+)?grand\s+challenge\b|grand\s+challenge|комплексн\p{L}*\s+инженерн\p{L}*\s+(?:экспертиз|анализ)/iu.test(text)) return true
  if (text.length < 1600) return false
  const subjects = [
    /(?:\bNPV\b|\bIRR\b|экономик|cash.?flow|инвестиц|CAPEX|OPEX|дисконт|break.?even)/iu,
    /(?:гипотез|диагност|pressure|давлен|прорыв|конусообраз|causal|причин|PLT|tracer|пластов)/iu,
    /(?:H2S|H₂S|безопасност|risks?|коррози|well\s+integrity|HSE|критическ)/iu,
    /(?:прогноз|forecast|сценари|sensitivity|чувствительн|eor|заводнен|waterflood)/iu,
    /(?:представь\s+отч[её]т|инвестиционн\p{L}*\s+комитет|план\s+работ|recommendation|заключени)/iu,
  ]
  return subjects.filter(pattern => pattern.test(text)).length >= 3
}
/** Selecting Oil enables its domain, not an unconditional paid ensemble. */
export function requestsOilModelInterpretation(prompt:string) {
  return requiresPetroleumExpertSynthesis(prompt) || /(?:ансамбл|ensemble|multi.model|нескольк\p{L}*\s+модел|интерпретаци\p{L}*\s+модел|model\s+interpretation)/iu.test(prompt)
}
