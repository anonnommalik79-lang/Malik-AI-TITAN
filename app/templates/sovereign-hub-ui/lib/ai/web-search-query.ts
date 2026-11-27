import { normalizeColloquial } from "./colloquial"
/** Remove conversational instructions without changing the named subject. */
export function normalizeWebSearchQuery(prompt: string): string {
  return normalizeColloquial(prompt).replace(/\[(?:system|assistant|developer|internal)[^\]]*\][\s\S]*$/iu, "")
    .replace(/^(?:нет|неа|no|жоқ)[,\s]+/iu, "")
    .replace(/(?<!\p{L})на\s+данный\s+момент(?!\p{L})/giu, "сейчас")
    .replace(/(?<!\p{L})всех\s+мире(?!\p{L})/giu, "во всём мире")
    .replace(/^(?:что\s+)?(?:ты\s+)?(?:знаеш[ь]?|знаете|расскажи(?:те)?|скажи(?:те)?|поведай|опиши|дай\s+(?:инфу|информацию|справку))(?:\s+(?:мне|нам|пожалуйста))?(?:\s+(?:ли|что[- ]нибудь))?\s+(?:про|о|об|обо)\s+/iu, "")
    .replace(/^(?:tell\s+me\s+(?:about|more\s+about)|what\s+do\s+you\s+know\s+about)\s+/iu, "")
    // «сравни жёстко/на глубоком уровне X и Y» searches for «X и Y сравнение».
    .replace(/^(?:сравни(?:те)?|compare)\s+(?:(?:на\s+)?(?:ж[её]стк\p{L}*|глубок\p{L}*|подробн\p{L}*|детальн\p{L}*)\s+(?:уровн\p{L}*\s+)?|ж[её]стко\s+|подробно\s+)?(.+)$/iu, "$1 сравнение")
    .replace(/(?:дай|покажи|перечисли|назови)(?:\s+(?:мне|пожалуйста))?\s+(?:всех\s+)?спикер[\p{L}]*/giu, "спикеры")
    .replace(/^(?:поищи|найди|покажи)(?:\s+мне)?\s+(?:информацию\s+)?(?:про\s+|о\s+)?/iu, "")
    .replace(/\s+/gu, " ").trim().slice(0, 260)
}

/** A data lookup for living cohorts needs the current age distribution. */
export function birthCohortDataQuery(text: string, asOfYear: string): string {
  if (!/(?:во\s+вс[её]м\s+мире|\bworld(?:wide)?\b|(?<!\p{L})в\s+мире)/iu.test(text)) return ""
  const year = [...text.matchAll(/(?<!\d)(?:19|20)\d{2}(?!\d)/gu)].at(-1)?.[0]
  if (!year && !/(?:родивш|рожден|рождён|год[ау]?\s+рождени|\bborn\b|birth\s+cohort)/iu.test(text)) return ""
  return ["World population by single year of age", asOfYear, "UN World Population Prospects", year && `cohort born ${year}`].filter(Boolean).join(" ")
}

/** Keep named events as a whole, rather than matching any generic 'AI' page. */
export function eventSearchTitle(prompt: string): string {
  if (!/(?:спикер|участник|хедлайнер|программ|speakers?|participants?|line[ -]?up|programme?)/iu.test(prompt)) return ""
  const query = normalizeWebSearchQuery(prompt)
  const quoted = query.match(/[«"]([^»"]{3,90})[»"]/u)?.[1]
  if (quoted) return quoted
  const latin = query.match(/[a-z][a-z\d'’-]*(?:\s+[a-z\d][a-z\d'’-]*){1,6}/iu)?.[0] || ""
  return latin.replace(/(?:^|\s)(?:all|the|speakers?|participants?|official|programme?|program|lineup|give|show|list|of|at|for|\d{4})(?=\s|$)/giu, " ").replace(/\s+/gu, " ").trim()
}

/**
 * «второй президент» with no country, asked in Russian or Kazakh, is about
 * Kazakhstan for Malik AI's users - the search adds the country so the
 * sources match the person the answer names. Returns "" when nothing to add.
 */
export function localRoleQuery(query: string): string {
  const text = String(query || "")
  if (!/[а-яёәіңғүұқөһ]/iu.test(text)) return ""
  if (!/(?<![\p{L}])(?:пр[еи]з[еи]дент\p{L}*|премьер\p{L}*|аким\p{L}*|министр\p{L}*|спикер\p{L}*\s+(?:мажилиса|сената)|глав\p{L}*\s+государства|столиц\p{L}*|конституци\p{L}*|парламент\p{L}*)(?![\p{L}])/iu.test(text)) return ""
  if (/(?:казахст|қазақст|кз(?![\p{L}])|рк(?![\p{L}])|росси|рф(?![\p{L}])|сша|америк|украин|кыргыз|киргиз|узбек|таджик|туркмен|беларус|белорус|франц|герман|китай|кнр|турц|япони|коре|инди|британ|англи|итали|испани|польш|грузи|армени|азербайдж|монгол|иран|израил|египт|бразил|канад|мексик|аргентин|usa|russia|kazakhstan|ukraine|china|france|germany)/iu.test(text)) return ""
  return `${text} Казахстана`
}
