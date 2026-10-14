import type { OilLanguage } from "@/lib/work/petroleum/analysis-contract"

/**
 * The few words the chat route adds around an oil report, in the language
 * the question was asked in. The report itself is already localized; the
 * heading over the models' interpretation and the «models did not answer»
 * notes used to be Russian for everyone.
 */

const HEADING: Record<OilLanguage, string> = {
  ru: "Инженерная интерпретация моделей — требует проверки",
  en: "Engineering interpretation by the models — needs review",
  kk: "Модельдердің инженерлік түсіндірмесі — тексеруді қажет етеді",
  ar: "التفسير الهندسي للنماذج — يحتاج إلى مراجعة",
}

const UNAVAILABLE: Record<OilLanguage, { ensemble0: string; ensemble: string; model: string; kept: string }> = {
  ru: { ensemble0: "Участие моделей: 0/3 — ответы провайдеров не получены.", ensemble: "Ансамбль не вернул итоговый ответ; участие моделей не подтверждено.", model: "Модель не вернула итоговый ответ; участие провайдеров не подтверждено.", kept: "Детерминированные расчёты сохранены." },
  en: { ensemble0: "Model participation: 0/3 — no provider answered.", ensemble: "The ensemble returned no final answer; model participation is not confirmed.", model: "The model returned no final answer; provider participation is not confirmed.", kept: "The deterministic calculations are kept." },
  kk: { ensemble0: "Модельдердің қатысуы: 0/3 — провайдерлерден жауап келмеді.", ensemble: "Ансамбль қорытынды жауап бермеді; модельдердің қатысуы расталмады.", model: "Модель қорытынды жауап бермеді; провайдерлердің қатысуы расталмады.", kept: "Детерминирленген есептер сақталды." },
  ar: { ensemble0: "مشاركة النماذج: 0/3 — لم يُستلم أي رد من المزودين.", ensemble: "لم تُرجع المجموعة إجابة نهائية؛ مشاركة النماذج غير مؤكدة.", model: "لم يُرجع النموذج إجابة نهائية؛ مشاركة المزودين غير مؤكدة.", kept: "تم الاحتفاظ بالحسابات الحتمية." },
}

export function oilInterpretationHeading(language: OilLanguage) {
  return `### ${HEADING[language] || HEADING.ru}\n\n`
}

/** `noProvider`: the ensemble reported that none of its three models answered. */
export function oilModelsUnavailable(language: OilLanguage, kind: "ensemble" | "model", noProvider: boolean) {
  const copy = UNAVAILABLE[language] || UNAVAILABLE.ru
  return `${noProvider ? copy.ensemble0 : kind === "ensemble" ? copy.ensemble : copy.model} ${copy.kept}`
}
