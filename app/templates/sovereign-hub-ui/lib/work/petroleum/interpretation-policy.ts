import type { OilLanguage } from "./analysis-contract"

const FINANCE = /\b(?:NPV|IRR|ROI|DCF|CAPEX|OPEX|USD|KZT|EUR|cash.?flow|payback|profit\w*|economic\w*|revenue|break.?even)\b|экономик|рентаб|прибыл|выруч|окупаем|затрат|денежн|пайда|ақша|ربح|أرباح|تدفقات نقدية|[$€₸]\s*\d/iu
const MISSING = /not (?:computed|calculated|available)|no (?:price|cash.?flows?|cost)|missing|needs? (?:review|data|price)|недостат|не (?:рассчитан|вычислен|определен)|нет (?:цен|данных|затрат)|требуются|необходимы|لا توجد/iu
const CLAIM = /(?:NPV|IRR|ROI|payback|profit\w*|нерентаб\p{L}*|окупаем\p{L}*)[^\n]{0,100}\d|[$€₸]\s*\d/iu

/** Model prose is not an economic computation. Numeric economics belongs to validated receipts. */
export function guardOilInterpretation(content: string, language: OilLanguage) {
  let removed = 0
  const paragraphs = content.split(/\n\s*\n/).filter(paragraph => {
    const text = paragraph.replace(/\bW-\d+\b/gi, "")
    const numeric = /\d/.test(text)
    const unverified = FINANCE.test(text) && numeric && !(MISSING.test(text) && !CLAIM.test(text))
    if (unverified) removed++
    return !unverified
  })
  const note: Record<OilLanguage, string> = {
    ru: "Числовые экономические утверждения модели скрыты: используйте только воспроизводимые значения расчётного отчёта. Сроки рентабельности, NPV и IRR требуют цен, затрат, денежных потоков и ставки дисконтирования; из одних дебитов они не следуют.",
    en: "Numeric economic claims from model interpretation were withheld: use only reproducible calculation receipts. Profitability timing, NPV and IRR require prices, costs, cash flows and a discount rate; production rates alone do not establish them.",
    kk: "Модельдің сандық экономикалық тұжырымдары жасырылды: тек есептік есептің тексерілген мәндерін пайдаланыңыз. Рентабельдік, NPV және IRR үшін баға, шығын, ақша ағыны және дисконт мөлшерлемесі қажет.",
    ar: "حُجبت الادعاءات الاقتصادية الرقمية للنموذج؛ استخدم فقط القيم القابلة لإعادة الحساب. تتطلب الربحية وNPV وIRR أسعاراً وتكاليف وتدفقات نقدية ومعدل خصم، ولا تنتج من معدلات الإنتاج وحدها.",
  }
  return { content: paragraphs.join("\n\n") + (removed ? `\n\n> ${note[language]}` : ""), removed }
}
