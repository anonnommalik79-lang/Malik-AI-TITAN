/** Narrow capability selection inside the existing chat router. Questions,
 * websites, other languages and attachments keep their established paths. */
export function selfBuildIntent(prompt: string) {
  const text = String(prompt || "").slice(0, 12000)
  if (/^\s*(?:как|что такое|объясни|how|what is|explain)(?!\p{L})/iu.test(text)) return false
  if (/(?:напиши|создай|write|create)\s+(?:инструкц|описан|письм|стать|обзор|план\b|documentation|instructions|an?\s+(?:email|article)|a\s+plan)/iu.test(text)) return false
  if (/(?:не\s+(?:создавай|пиши|делай)|(?:do not|don't) (?:build|write)|python|rust|golang|next\.?js|react|unity|pygame)/iu.test(text)) return false
  const creation = /(?:сделай|создай|собери|напиши|разработай|build|create|implement|write|жаса|құр)/iu.test(text)
  const cli = /(?:\bCLI\b|консольн\p{L}*\s+(?:утилит|прилож|программ)|command[- ]line)/iu.test(text)
  return creation && cli && /(?:тест|\btests?\b|node(?:\.js)?|javascript|\bjs\b)/iu.test(text)
}
