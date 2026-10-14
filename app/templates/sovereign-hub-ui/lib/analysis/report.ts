import { formatCurrency, formatNumber, formatPercent, plural } from "@/lib/visual/format"
import { round, type AnalysisLocale, type DataAnalysis, type MeasureStats } from "./engine"

/**
 * Malik Analyst — the presentation half.
 *
 * Turns a DataAnalysis into the same kind of answer the oil reports give: a
 * short verdict, a panel of key figures, charts, the table with its changes,
 * the formulas with the actual numbers substituted, outliers and limits.
 * Charts and tables are Visual Engine blocks (```malik-visual), so they are
 * interactive and export CSV/PNG without any new renderer. Every number here
 * comes from the engine; nothing is estimated.
 */

type Copy = {
  title: string; summary: string; keyFigures: string; total: string; average: string; median: string; max: string; min: string
  last: string; change: string; cagr: string; periods: string; dynamics: string; byCategory: string; shares: string
  stepChange: string; table: string; delta: string; deltaPct: string; share: string; forecast: string; trend: string
  others: string; relation: string; formulas: string; anomalies: string; limits: string; receipt: (rows: number, measures: number, hash: string) => string
  grew: string; fell: string; flat: string; from: string; to: string; peak: string; low: string; biggestRise: string; biggestDrop: string
  leader: string; ofTotal: string; correlation: string; strong: string; moderate: string; weak: string; positive: string; negative: string
  forecastNote: (n: number, r2: string) => string; weakTrend: (r2: string) => string; meanNote: (name: string) => string
  duplicates: string; truncated: string; skipped: (names: string) => string; notCausal: string
  narrative: string; narrativeUnavailable: string; label: string; item: string
}

const COPY: Record<AnalysisLocale, Copy> = {
  ru: {
    title: "Анализ данных", summary: "Коротко", keyFigures: "Ключевые показатели", total: "Итого", average: "Среднее", median: "Медиана",
    max: "Максимум", min: "Минимум", last: "Последнее значение", change: "Изменение", cagr: "Среднегодовой рост (CAGR)", periods: "Точек данных",
    dynamics: "Динамика", byCategory: "Сравнение", shares: "Структура", stepChange: "Изменение к предыдущему периоду", table: "Данные и расчёты",
    delta: "Изменение", deltaPct: "Изменение, %", share: "Доля, %", forecast: "Прогноз (линейный тренд)", trend: "Тренд", others: "Остальные",
    relation: "Связь показателей", formulas: "Формулы и проверка", anomalies: "Выбросы", limits: "Ограничения",
    receipt: (rows, measures, hash) => `Все числа выше посчитаны Malik Analyst по вашим данным (${rows} ${plural(rows, "строка", "строки", "строк")}, показателей: ${measures}, SHA-256 ${hash}). Модель их не вычисляла.`,
    grew: "рост", fell: "снижение", flat: "без изменений", from: "с", to: "до", peak: "пик", low: "минимум", biggestRise: "самый сильный рост",
    biggestDrop: "самое сильное падение", leader: "лидер", ofTotal: "от итога", correlation: "корреляция", strong: "сильная", moderate: "умеренная",
    weak: "слабая", positive: "прямая", negative: "обратная",
    forecastNote: (n, r2) => `Прогноз — продолжение линейного тренда по ${n} точкам (R² = ${r2}). Он не учитывает сезонность и внешние факторы.`,
    weakTrend: (r2) => `Линейный тренд слабый (R² = ${r2}), поэтому прогноз не строился.`,
    meanNote: (name) => `«${name}» — средняя величина, поэтому повторяющиеся периоды усреднены, а не сложены.`,
    duplicates: "Строки с одинаковыми метками объединены.", truncated: "Таблица длинная: прочитана её начальная часть.",
    skipped: (names) => `Без расчётов (не числа): ${names}.`, notCausal: "Корреляция показывает совместное движение, а не причину.",
    narrative: "Выводы Malik AI", narrativeUnavailable: "Текстовый разбор модели сейчас не получен. Расчёты выше проверены и не зависят от модели.", label: "Период", item: "Категория",
  },
  kk: {
    title: "Деректерді талдау", summary: "Қысқаша", keyFigures: "Негізгі көрсеткіштер", total: "Барлығы", average: "Орташа", median: "Медиана",
    max: "Ең үлкен", min: "Ең кіші", last: "Соңғы мән", change: "Өзгеріс", cagr: "Жылдық орташа өсім (CAGR)", periods: "Нүктелер саны",
    dynamics: "Динамика", byCategory: "Салыстыру", shares: "Құрылым", stepChange: "Алдыңғы кезеңге қарағанда өзгеріс", table: "Деректер мен есептер",
    delta: "Өзгеріс", deltaPct: "Өзгеріс, %", share: "Үлес, %", forecast: "Болжам (сызықтық тренд)", trend: "Тренд", others: "Басқалары",
    relation: "Көрсеткіштер байланысы", formulas: "Формулалар және тексеру", anomalies: "Ауытқулар", limits: "Шектеулер",
    receipt: (rows, measures, hash) => `Жоғарыдағы барлық сандарды Malik Analyst сіздің деректеріңіз бойынша есептеді (${rows} жол, көрсеткіш: ${measures}, SHA-256 ${hash}). Модель оларды есептеген жоқ.`,
    grew: "өсім", fell: "төмендеу", flat: "өзгеріссіз", from: "", to: "→", peak: "ең жоғары", low: "ең төмен", biggestRise: "ең үлкен өсім",
    biggestDrop: "ең үлкен төмендеу", leader: "көшбасшы", ofTotal: "жалпыдан", correlation: "корреляция", strong: "күшті", moderate: "орташа",
    weak: "әлсіз", positive: "тура", negative: "кері",
    forecastNote: (n, r2) => `Болжам — ${n} нүкте бойынша сызықтық трендтің жалғасы (R² = ${r2}). Маусымдық және сыртқы факторлар ескерілмейді.`,
    weakTrend: (r2) => `Сызықтық тренд әлсіз (R² = ${r2}), сондықтан болжам жасалмады.`,
    meanNote: (name) => `«${name}» — орташа шама, сондықтан қайталанатын кезеңдер қосылмай, орташаланды.`,
    duplicates: "Бірдей белгілері бар жолдар біріктірілді.", truncated: "Кесте ұзын: оның бастапқы бөлігі оқылды.",
    skipped: (names) => `Есептелмеді (сан емес): ${names}.`, notCausal: "Корреляция себепті емес, бірге өзгеруді көрсетеді.",
    narrative: "Malik AI қорытындысы", narrativeUnavailable: "Модельдің мәтіндік талдауы қазір алынбады. Жоғарыдағы есептер тексерілген және модельге тәуелді емес.", label: "Кезең", item: "Санат",
  },
  en: {
    title: "Data analysis", summary: "In short", keyFigures: "Key figures", total: "Total", average: "Average", median: "Median",
    max: "Maximum", min: "Minimum", last: "Latest value", change: "Change", cagr: "Compound annual growth (CAGR)", periods: "Data points",
    dynamics: "Trend over time", byCategory: "Comparison", shares: "Breakdown", stepChange: "Change vs previous period", table: "Data and calculations",
    delta: "Change", deltaPct: "Change, %", share: "Share, %", forecast: "Forecast (linear trend)", trend: "Trend", others: "Others",
    relation: "Relationship", formulas: "Formulas and checks", anomalies: "Outliers", limits: "Limitations",
    receipt: (rows, measures, hash) => `Every number above was computed by Malik Analyst from your data (${rows} rows, ${measures} measures, SHA-256 ${hash}). The model did not calculate them.`,
    grew: "rise", fell: "decline", flat: "no change", from: "from", to: "to", peak: "peak", low: "low", biggestRise: "biggest rise",
    biggestDrop: "biggest drop", leader: "leader", ofTotal: "of the total", correlation: "correlation", strong: "strong", moderate: "moderate",
    weak: "weak", positive: "positive", negative: "negative",
    forecastNote: (n, r2) => `The forecast extends a linear trend over ${n} points (R² = ${r2}). It ignores seasonality and outside factors.`,
    weakTrend: (r2) => `The linear trend is weak (R² = ${r2}), so no forecast was made.`,
    meanNote: (name) => `"${name}" is an average-type value, so repeated periods were averaged, not added.`,
    duplicates: "Rows with the same label were combined.", truncated: "The table is long: its first part was read.",
    skipped: (names) => `Not calculated (not numbers): ${names}.`, notCausal: "Correlation shows things moving together, not cause and effect.",
    narrative: "Malik AI takeaways", narrativeUnavailable: "The model's written analysis is not available right now. The calculations above are verified and do not depend on it.", label: "Period", item: "Category",
  },
}

export function analysisCopy(locale: AnalysisLocale) {
  return COPY[locale]
}

const LOCALE_TAG: Record<AnalysisLocale, string> = { ru: "ru-RU", kk: "kk-KZ", en: "en-US" }

function num(value: number, locale: AnalysisLocale, measure?: MeasureStats) {
  if (measure?.currency) return formatCurrency(value, measure.currency)
  const text = formatNumber(value, LOCALE_TAG[locale])
  if (measure?.percent) return `${text}%`
  return measure?.unit && !/^[%₸$€₽]$/.test(measure.unit) ? `${text} ${measure.unit}` : text
}

function pct(value: number | null, locale: AnalysisLocale) {
  if (value === null || !Number.isFinite(value)) return "—"
  return `${value > 0 ? "+" : ""}${formatPercent(value, LOCALE_TAG[locale])}`
}

function signed(value: number, locale: AnalysisLocale, measure: MeasureStats) {
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${num(Math.abs(value), locale, measure)}`
}

const clip = (value: string, max: number) => (value.length > max ? `${value.slice(0, max - 1)}…` : value)
const visual = (block: Record<string, unknown>) => ["```malik-visual", JSON.stringify(block), "```"].join("\n")
const r = (value: number, digits = 4) => round(value, digits)
const md = (value: string) => value.replace(/[|*_`\\[\]<>]/g, (char) => `\\${char}`)

function strength(value: number, copy: Copy) {
  const size = Math.abs(value)
  return `${size >= 0.7 ? copy.strong : size >= 0.4 ? copy.moderate : copy.weak} ${value >= 0 ? copy.positive : copy.negative}`
}

/** Sentences anyone can read in five seconds; each number is from the engine. */
export function summaryLines(analysis: DataAnalysis, locale: AnalysisLocale) {
  const copy = COPY[locale]
  const lines: string[] = []
  const primary = analysis.measures[0]
  const sequence = analysis.axis !== "category"
  if (sequence) {
    const verb = primary.change > 0 ? copy.grew : primary.change < 0 ? copy.fell : copy.flat
    const pctText = primary.changePct !== null && primary.change !== 0 ? ` (${pct(primary.changePct, locale)})` : ""
    const span = primary.change !== 0 ? ` ${copy.from ? `${copy.from} ` : ""}${num(primary.first.value, locale, primary)} ${copy.to} ${num(primary.last.value, locale, primary)}` : ""
    lines.push(`**${md(primary.name)}**: ${verb}${span}${pctText} — ${md(primary.first.label)} → ${md(primary.last.label)}.`)
    lines.push(`${copy.peak[0].toUpperCase()}${copy.peak.slice(1)} — ${md(primary.max.label)} (${num(primary.max.value, locale, primary)}), ${copy.low} — ${md(primary.min.label)} (${num(primary.min.value, locale, primary)}).`)
    if (primary.biggestRise || primary.biggestDrop) {
      const parts: string[] = []
      if (primary.biggestRise) parts.push(`${copy.biggestRise}: ${md(primary.biggestRise.from)} → ${md(primary.biggestRise.label)} (${signed(primary.biggestRise.delta, locale, primary)})`)
      if (primary.biggestDrop) parts.push(`${copy.biggestDrop}: ${md(primary.biggestDrop.from)} → ${md(primary.biggestDrop.label)} (${signed(primary.biggestDrop.delta, locale, primary)})`)
      lines.push(`${parts.join("; ")}.`.replace(/^./, (char) => char.toUpperCase()))
    }
    if (primary.cagrPct !== null) lines.push(`${copy.cagr}: ${pct(primary.cagrPct, locale)}.`)
    if (primary.trend?.forecast.length) {
      const next = primary.trend.forecast[0]
      lines.push(`${copy.forecast}: ${md(next.label)} ≈ ${num(next.value, locale, primary)} (R² = ${formatNumber(primary.trend.r2, LOCALE_TAG[locale])}).`)
    }
  } else {
    const shares = primary.shares
    lines.push(`${copy.leader[0].toUpperCase()}${copy.leader.slice(1)} — **${md(primary.max.label)}**: ${num(primary.max.value, locale, primary)}${shares ? ` (${formatPercent(shares[0].share, LOCALE_TAG[locale])} ${copy.ofTotal})` : ""}; ${copy.low} — ${md(primary.min.label)}: ${num(primary.min.value, locale, primary)}.`)
    if (primary.aggregation === "sum") lines.push(`${copy.total}: ${num(primary.sum, locale, primary)}; ${copy.average.toLowerCase()}: ${num(primary.mean, locale, primary)}.`)
    else lines.push(`${copy.average}: ${num(primary.mean, locale, primary)}; ${copy.median.toLowerCase()}: ${num(primary.median, locale, primary)}.`)
    if (shares && shares.length >= 3) {
      const top = shares.slice(0, Math.min(3, shares.length))
      const topShare = top.reduce((total, item) => total + item.share, 0)
      lines.push(`${top.map((item) => md(item.label)).join(", ")} — ${formatPercent(topShare, LOCALE_TAG[locale])} ${copy.ofTotal}.`)
    }
  }
  if (analysis.categoryTotals) {
    const leader = analysis.categoryTotals.rows[0]
    lines.push(`${md(analysis.categoryTotals.by)}: ${copy.leader} — **${md(leader.label)}** (${formatPercent(leader.share, LOCALE_TAG[locale])} ${copy.ofTotal}).`)
  }
  const relation = analysis.correlations.find((pair) => Math.abs(pair.r) >= 0.6 && pair.n >= 5)
  if (relation) lines.push(`${md(relation.a)} ↔ ${md(relation.b)}: ${strength(relation.r, copy)} ${copy.correlation} (r = ${formatNumber(relation.r, LOCALE_TAG[locale])}, n = ${relation.n}).`)
  const outliers = analysis.measures.flatMap((measure) => measure.anomalies.map((item) => ({ measure, item }))).slice(0, 3)
  if (outliers.length) lines.push(`${copy.anomalies}: ${outliers.map(({ measure, item }) => `${md(item.label)} — ${md(measure.name)} ${num(item.value, locale, measure)}`).join("; ")}.`)
  return lines
}

function metricFor(measure: MeasureStats) {
  return measure.currency ? { format: "currency", currency: measure.currency } : measure.percent ? { format: "percent" } : { format: "number", ...(measure.unit && !/^[%₸$€₽]$/.test(measure.unit) ? { unit: clip(measure.unit, 12) } : {}) }
}

function dashboard(analysis: DataAnalysis, locale: AnalysisLocale) {
  const copy = COPY[locale]
  const sequence = analysis.axis !== "category"
  return {
    version: 2, type: "dashboard", title: copy.keyFigures, dataKind: "user",
    periods: analysis.measures.slice(0, 6).map((measure) => {
      const metric = metricFor(measure)
      const metrics: Array<Record<string, unknown>> = []
      if (measure.aggregation === "sum") metrics.push({ label: copy.total, value: r(measure.sum), ...metric })
      metrics.push({ label: copy.average, value: r(measure.mean), ...metric })
      if (sequence) metrics.push({ label: clip(`${copy.last}: ${measure.last.label}`, 48), value: r(measure.last.value), ...metric, ...(measure.changePct !== null ? { delta: r(measure.changePct, 2) } : {}) })
      metrics.push({ label: clip(`${copy.max}: ${measure.max.label}`, 48), value: r(measure.max.value), ...metric })
      metrics.push({ label: clip(`${copy.min}: ${measure.min.label}`, 48), value: r(measure.min.value), ...metric })
      if (measure.cagrPct !== null) metrics.push({ label: "CAGR", value: r(measure.cagrPct, 2), format: "percent" })
      metrics.push({ label: copy.median, value: r(measure.median), ...metric })
      metrics.push({ label: copy.periods, value: measure.count, format: "number" })
      return { label: clip(measure.name, 24), metrics: metrics.slice(0, 8) }
    }),
  }
}

/** Measures drawn together only when their scales are comparable. */
function companions(analysis: DataAnalysis) {
  const primary = analysis.measures[0]
  const scale = Math.max(Math.abs(primary.max.value), Math.abs(primary.min.value)) || 1
  return analysis.measures.slice(1).filter((measure) => {
    const other = Math.max(Math.abs(measure.max.value), Math.abs(measure.min.value)) || 1
    return measure.percent === primary.percent && measure.currency === primary.currency && Math.max(scale / other, other / scale) <= 10
  }).slice(0, 3)
}

function mainChart(analysis: DataAnalysis, locale: AnalysisLocale) {
  const copy = COPY[locale]
  const primary = analysis.measures[0]
  const together = [primary, ...companions(analysis)]
  const unit = primary.currency ? { KZT: "₸", USD: "$", EUR: "€", RUB: "₽" }[primary.currency] : primary.percent ? "%" : primary.unit
  if (analysis.axis !== "category") {
    const forecast = primary.trend?.forecast || []
    const labels = [...analysis.labels, ...forecast.map((point) => point.label)].map((label) => clip(label, 40))
    const series = together.map((measure) => ({
      name: clip(measure.name, 60),
      values: [...measure.steps.map((step) => (step.value === null ? null : r(step.value))), ...forecast.map(() => null)],
    }))
    if (forecast.length) {
      const lastIndex = analysis.labels.length - 1
      series.push({
        name: copy.forecast,
        values: labels.map((_, at) => (at === lastIndex ? r(primary.steps[lastIndex].value ?? primary.last.value) : at > lastIndex ? r(forecast[at - lastIndex - 1].value) : null)),
      })
    }
    return {
      version: 2, type: "chart", chart: "line", title: clip(`${copy.dynamics}: ${together.map((measure) => measure.name).join(", ")}`, 100),
      dataKind: "user", ...(unit ? { unit: clip(unit, 16) } : {}), ...(analysis.labelColumn ? { xLabel: clip(analysis.labelColumn, 40) } : {}),
      labels, series, ...(forecast.length ? { note: clip(copy.forecastNote(primary.count, formatNumber(primary.trend!.r2, LOCALE_TAG[locale])), 280) } : {}),
    }
  }
  const order = [...analysis.labels].map((label, at) => ({ label, at })).sort((a, b) => (primary.steps[b.at].value ?? -Infinity) - (primary.steps[a.at].value ?? -Infinity)).slice(0, 40)
  const long = order.length > 7 || order.some((item) => item.label.length > 14)
  return {
    version: 2, type: "chart", chart: long ? "hbar" : "bar", title: clip(`${copy.byCategory}: ${together.map((measure) => measure.name).join(", ")}`, 100),
    dataKind: "user", ...(unit ? { unit: clip(unit, 16) } : {}),
    labels: order.map((item) => clip(item.label, 40)),
    series: together.map((measure) => ({ name: clip(measure.name, 60), values: order.map((item) => { const value = measure.steps[item.at].value; return value === null ? null : r(value) }) })),
  }
}

function sharesChart(analysis: DataAnalysis, locale: AnalysisLocale) {
  const copy = COPY[locale]
  const source = analysis.categoryTotals
    ? { title: `${copy.shares}: ${analysis.categoryTotals.measure} — ${analysis.categoryTotals.by}`, rows: analysis.categoryTotals.rows }
    : analysis.measures[0].shares && analysis.measures[0].shares.length >= 3 && analysis.measures[0].shares.length <= 30
      ? { title: `${copy.shares}: ${analysis.measures[0].name}`, rows: analysis.measures[0].shares }
      : null
  if (!source) return null
  const top = source.rows.slice(0, 6)
  const rest = source.rows.slice(6).reduce((total, item) => total + item.value, 0)
  const rows = rest > 0 ? [...top, { label: copy.others, value: rest }] : top
  return {
    version: 2, type: "chart", chart: "donut", title: clip(source.title, 100), dataKind: "user",
    labels: rows.map((item) => clip(item.label, 40)),
    series: [{ name: clip(analysis.categoryTotals?.measure || analysis.measures[0].name, 60), values: rows.map((item) => r(item.value)) }],
  }
}

function stepChart(analysis: DataAnalysis, locale: AnalysisLocale) {
  const copy = COPY[locale]
  const primary = analysis.measures[0]
  if (analysis.axis === "category" || primary.steps.length < 3) return null
  const steps = primary.steps.slice(1)
  return {
    version: 2, type: "chart", chart: "bar", title: clip(`${copy.stepChange}: ${primary.name}`, 100), dataKind: "user",
    labels: steps.map((step) => clip(step.label, 40)),
    series: [{ name: copy.delta, values: steps.map((step) => (step.delta === null ? null : r(step.delta))) }],
  }
}

function dataTable(analysis: DataAnalysis, locale: AnalysisLocale) {
  const copy = COPY[locale]
  const primary = analysis.measures[0]
  const sequence = analysis.axis !== "category"
  const kind = (measure: MeasureStats) => (measure.currency ? { kind: "currency", currency: measure.currency } : measure.percent ? { kind: "percent" } : { kind: "number" })
  const others = analysis.measures.slice(1, 8)
  const columns: Array<Record<string, unknown>> = [
    { label: clip(analysis.labelColumn || (analysis.axis === "category" ? copy.item : copy.label), 40), kind: "text" },
    { label: clip(primary.name, 40), ...kind(primary) },
    ...(sequence ? [{ label: copy.delta, ...kind(primary) }, { label: copy.deltaPct, kind: "percent" }] : []),
    ...(!sequence && primary.shares ? [{ label: copy.share, kind: "percent" }] : []),
    ...others.map((measure) => ({ label: clip(measure.name, 40), ...kind(measure) })),
  ].slice(0, 12)
  const shareOf = new Map((primary.shares || []).map((item) => [item.label, item.share]))
  const rows = analysis.labels.slice(0, 1000).map((label, at) => {
    const step = primary.steps[at]
    const row: Array<string | number | null> = [clip(label, 300), step.value === null ? null : r(step.value)]
    if (sequence) row.push(step.delta === null ? null : r(step.delta), step.deltaPct === null ? null : r(step.deltaPct, 2))
    if (!sequence && primary.shares) row.push(shareOf.has(label) ? r(shareOf.get(label)!, 2) : null)
    for (const measure of others) row.push(measure.steps[at]?.value === null || measure.steps[at] === undefined ? null : r(measure.steps[at].value!))
    return row.slice(0, columns.length)
  })
  return {
    version: 2, type: "table", title: copy.table, dataKind: "user", columns, rows,
    highlight: { column: 1, best: "max" }, ...(rows.length > 12 ? { pageSize: 12 } : {}),
  }
}

function scatterChart(analysis: DataAnalysis, locale: AnalysisLocale) {
  const copy = COPY[locale]
  const pair = analysis.correlations.find((item) => Math.abs(item.r) >= 0.6 && item.n >= 5)
  if (!pair) return null
  const a = analysis.measures.find((measure) => measure.name === pair.a)!
  const b = analysis.measures.find((measure) => measure.name === pair.b)!
  const points = a.steps.map((step, at) => ({ x: step.value, y: b.steps[at]?.value ?? null, label: step.label }))
    .filter((point): point is { x: number; y: number; label: string } => point.x !== null && point.y !== null).slice(0, 500)
  return {
    version: 2, type: "chart", chart: "scatter", title: clip(`${copy.relation}: ${pair.a} ↔ ${pair.b}`, 100), dataKind: "user",
    xLabel: clip(pair.a, 40), yLabel: clip(pair.b, 40),
    scatter: [{ name: clip(`r = ${formatNumber(pair.r, LOCALE_TAG[locale])}`, 60), points: points.map((point) => ({ x: r(point.x), y: r(point.y), label: clip(point.label, 60) })) }],
    note: copy.notCausal,
  }
}

function formulaLines(analysis: DataAnalysis, locale: AnalysisLocale) {
  const copy = COPY[locale]
  const primary = analysis.measures[0]
  const n = primary.count
  const tag = LOCALE_TAG[locale]
  const f = (value: number) => num(value, locale, primary)
  const lines: string[] = []
  if (primary.aggregation === "sum") lines.push(`${copy.total}: Σ ${md(primary.name)} = ${f(primary.sum)}`)
  lines.push(`${copy.average}: Σ / n = ${f(primary.sum)} / ${n} = ${f(primary.mean)}`)
  if (analysis.axis !== "category" && primary.changePct !== null) {
    lines.push(`${copy.change}: (${f(primary.last.value)} − ${f(primary.first.value)}) / ${f(Math.abs(primary.first.value))} × 100 = ${pct(primary.changePct, locale)}`)
  }
  if (primary.cagrPct !== null) lines.push(`CAGR: (${f(primary.last.value)} / ${f(primary.first.value)})^(1/${primary.cagrYears}) − 1 = ${pct(primary.cagrPct, locale)}`)
  if (primary.shares?.length) lines.push(`${copy.share}: ${md(primary.shares[0].label)} = ${f(primary.shares[0].value)} / ${f(primary.sum)} × 100 = ${formatPercent(primary.shares[0].share, tag)}`)
  if (primary.trend) {
    lines.push(`${copy.trend}: y = ${formatNumber(primary.trend.intercept, tag)} ${primary.trend.slope >= 0 ? "+" : "−"} ${formatNumber(Math.abs(primary.trend.slope), tag)} · x (x = 0…${n - 1}), R² = ${formatNumber(primary.trend.r2, tag)}`)
  }
  if (primary.anomalies.length) lines.push(`${copy.anomalies}: |0,6745 · (x − median) / MAD| > 3,5`)
  for (const pair of analysis.correlations.filter((item) => item.n >= 5).slice(0, 2)) lines.push(`Pearson ${copy.correlation}: ${md(pair.a)} ↔ ${md(pair.b)} = ${formatNumber(pair.r, tag)} (n = ${pair.n})`)
  return lines
}

function limitLines(analysis: DataAnalysis, locale: AnalysisLocale) {
  const copy = COPY[locale]
  const primary = analysis.measures[0]
  const lines: string[] = []
  if (primary.trend && !primary.trend.forecast.length) lines.push(copy.weakTrend(formatNumber(primary.trend.r2, LOCALE_TAG[locale])))
  if (primary.trend?.forecast.length) lines.push(copy.forecastNote(primary.count, formatNumber(primary.trend.r2, LOCALE_TAG[locale])))
  if (analysis.aggregatedDuplicates) {
    lines.push(copy.duplicates)
    for (const measure of analysis.measures.filter((item) => item.aggregation === "mean")) lines.push(copy.meanNote(measure.name))
  }
  if (analysis.truncated) lines.push(copy.truncated)
  if (analysis.skippedColumns.length) lines.push(copy.skipped(analysis.skippedColumns.slice(0, 6).map((name) => `«${name}»`).join(", ")))
  if (analysis.correlations.some((pair) => Math.abs(pair.r) >= 0.6)) lines.push(copy.notCausal)
  return lines
}

export type AnalysisReport = { markdown: string; evidence: string; blocks: number }

/** The Visual Engine refuses blocks over 64 KB; Cyrillic text takes two bytes a letter. */
const BLOCK_BYTES = 30_000

/** A long table keeps its first rows, enough to fit one block. */
function fitted(table: ReturnType<typeof dataTable>) {
  let rows = table.rows
  while (rows.length > 10 && JSON.stringify({ ...table, rows }).length > BLOCK_BYTES) rows = rows.slice(0, Math.floor(rows.length * 0.7))
  return rows.length === table.rows.length ? table : { ...table, rows, subtitle: `${rows.length} / ${table.rows.length}` }
}

/** The answer the person sees first: verdict, panel, charts, table, formulas, limits. */
export function renderAnalysisReport(analysis: DataAnalysis, input: { locale: AnalysisLocale; title?: string; hash: string }): AnalysisReport {
  const { locale } = input
  const copy = COPY[locale]
  const blocks = [dashboard(analysis, locale), mainChart(analysis, locale), sharesChart(analysis, locale), stepChart(analysis, locale), fitted(dataTable(analysis, locale)), scatterChart(analysis, locale)]
    .filter((block): block is NonNullable<typeof block> => Boolean(block) && JSON.stringify(block).length <= BLOCK_BYTES)
    .slice(0, 6)
  const formulas = formulaLines(analysis, locale)
  const limits = limitLines(analysis, locale)
  const title = input.title ? `${copy.title}: ${clip(input.title, 80)}` : copy.title
  const markdown = [
    `## ${md(title)}`,
    "",
    `**${copy.summary}:**`,
    "",
    ...summaryLines(analysis, locale).map((line) => `- ${line}`),
    "",
    ...blocks.flatMap((block) => [visual(block), ""]),
    `<details><summary>${copy.formulas}</summary>`,
    "",
    ...formulas.map((line) => `- ${line}`),
    "",
    "</details>",
    "",
    ...(limits.length ? [`**${copy.limits}:** ${limits.join(" ")}`, ""] : []),
    `*${copy.receipt(analysis.rows, analysis.measures.length, input.hash.slice(0, 12))}*`,
  ].join("\n")
  return { markdown, evidence: analysisEvidence(analysis, locale), blocks: blocks.length }
}

/** The computed facts, compact, for the model that writes the takeaways. */
export function analysisEvidence(analysis: DataAnalysis, locale: AnalysisLocale) {
  const tag = LOCALE_TAG[locale]
  const n = (value: number) => formatNumber(value, tag).replace(/[\u00a0\u202f]/g, " ")
  const lines = [
    `rows=${analysis.rows}; axis=${analysis.axis}; label column=${analysis.labelColumn || (analysis.axis === "index" ? "row number" : "unnamed labels")}; labels=${analysis.labels.length}`,
  ]
  for (const measure of analysis.measures) {
    lines.push([
      `MEASURE "${measure.name}" (${measure.aggregation}${measure.currency ? `, ${measure.currency}` : ""}${measure.percent ? ", percent" : ""}${measure.unit ? `, unit ${measure.unit}` : ""}):`,
      `count=${measure.count}; total=${n(measure.sum)}; mean=${n(measure.mean)}; median=${n(measure.median)}; std=${n(measure.std)}`,
      `min=${n(measure.min.value)} at ${measure.min.label}; max=${n(measure.max.value)} at ${measure.max.label}`,
      analysis.axis !== "category" ? `first=${n(measure.first.value)} (${measure.first.label}); last=${n(measure.last.value)} (${measure.last.label}); change=${n(measure.change)}${measure.changePct !== null ? ` (${n(measure.changePct)}%)` : ""}` : "",
      measure.cagrPct !== null ? `CAGR=${n(measure.cagrPct)}%` : "",
      measure.biggestRise ? `biggest rise ${measure.biggestRise.from}→${measure.biggestRise.label}: +${n(measure.biggestRise.delta)}` : "",
      measure.biggestDrop ? `biggest drop ${measure.biggestDrop.from}→${measure.biggestDrop.label}: ${n(measure.biggestDrop.delta)}` : "",
      measure.trend ? `linear trend slope=${n(measure.trend.slope)} per period, R²=${n(measure.trend.r2)}${measure.trend.forecast.length ? `; forecast ${measure.trend.forecast.map((point) => `${point.label}≈${n(point.value)}`).join(", ")}` : "; no forecast (weak trend)"}` : "",
      measure.shares ? `shares: ${measure.shares.slice(0, 8).map((item) => `${item.label} ${n(item.share)}%`).join(", ")}` : "",
      measure.anomalies.length ? `outliers: ${measure.anomalies.map((item) => `${item.label}=${n(item.value)}`).join(", ")}` : "",
      `series: ${measure.steps.slice(0, 60).map((step) => `${step.label}=${step.value === null ? "—" : n(step.value)}`).join("; ")}${measure.steps.length > 60 ? "; …" : ""}`,
    ].filter(Boolean).join("\n"))
  }
  if (analysis.categoryTotals) lines.push(`TOTALS BY "${analysis.categoryTotals.by}" of "${analysis.categoryTotals.measure}": ${analysis.categoryTotals.rows.slice(0, 12).map((item) => `${item.label}=${n(item.value)} (${n(item.share)}%)`).join("; ")}`)
  for (const pair of analysis.correlations) lines.push(`CORRELATION ${pair.a} ~ ${pair.b}: r=${n(pair.r)}, n=${pair.n}`)
  if (analysis.skippedColumns.length) lines.push(`non-numeric columns: ${analysis.skippedColumns.join(", ")}`)
  return lines.join("\n\n").slice(0, 14_000)
}
