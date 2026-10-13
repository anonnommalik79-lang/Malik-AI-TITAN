"use client"

import { useMemo, useState } from "react"
import type { OilLanguage, OilWellAnalysis } from "@/lib/work/petroleum/analysis-contract"
import { buildOilRateHeatmap } from "@/lib/visual/oil-heatmap"

const TEXT: Record<OilLanguage, { title: string; well: string; pages: string; note: string }> = {
  ru: { title: "Дебиты по скважинам · тепловая карта", well: "Скважина", pages: "Страница", note: "Реальные точки входной истории; пропуски не заполняются. Более светлая клетка — больший дебит." },
  en: { title: "Well-by-period oil rates · heatmap", well: "Well", pages: "Page", note: "Observed input series only; gaps are not filled. Lighter cells represent higher rates." },
  kk: { title: "Ұңғымалар бойынша мұнай дебиті · жылу картасы", well: "Ұңғыма", pages: "Бет", note: "Тек берілген өлшемдер; бос мәндер толтырылмайды. Ашық ұяшық — жоғары дебит." },
  ar: { title: "الخريطة الحرارية لمعدلات النفط حسب البئر", well: "البئر", pages: "صفحة", note: "قيم المدخلات الفعلية فقط؛ لا تُملأ البيانات الناقصة. الخلايا الفاتحة تعني معدلات أعلى." },
}

/** First true multi-well heatmap in the oil report: 12 observed periods, 20 wells/page.
 * Unlike a static image, this is an accessible real table, with hover values.
 */
export function OilWellHeatmap({ wells, language, unit }: {
  wells: OilWellAnalysis[]; language: OilLanguage; unit: string
}) {
  const matrix = useMemo(() => buildOilRateHeatmap(wells, 12), [wells])
  const [page, setPage] = useState(0)
  if (!matrix) return null
  const count = Math.max(1, Math.ceil(matrix.wells.length / 20))
  const currentPage = Math.min(page, count - 1)
  const shown = matrix.wells.slice(currentPage * 20, currentPage * 20 + 20)
  const words = TEXT[language]
  return <div data-oil-heatmap data-observed="true" style={{ background: "#000", color: "#fafafa" }}>
    <div style={{ maxWidth: "100%", overflowX: "auto" }}>
      <table aria-label={words.title} style={{ borderCollapse: "separate", borderSpacing: 2, minWidth: Math.max(560, 125 + matrix.periods.length * 56), width: "100%", fontVariantNumeric: "tabular-nums" }}>
        <thead><tr>
          <th scope="col" style={{ textAlign: "start", fontSize: 11, padding: "7px 5px", borderBottom: "1px solid #303030" }}>{words.well}</th>
          {matrix.periods.map((period) => <th scope="col" key={period.t} style={{ fontSize: 10, fontWeight: 500, color: "#b2b2b7", padding: "7px 3px", borderBottom: "1px solid #303030" }}>{period.label}</th>)}
        </tr></thead>
        <tbody>{shown.map((row) => <tr key={row.id}>
          <th scope="row" title={row.id} style={{ fontWeight: 500, fontSize: 11, textAlign: "start", maxWidth: 132, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", padding: "5px 4px" }}>{row.id}</th>
          {row.values.map((value,index) => {
            const shade = value === null ? 0 : matrix.maximum > 0 ? value / matrix.maximum : 0
            return <td key={matrix.periods[index].t}
              title={value === null ? "—" : `${row.id}: ${value} ${unit}`}
              aria-label={value === null ? `${row.id}, ${matrix.periods[index].label}: —` : `${row.id}, ${matrix.periods[index].label}: ${value} ${unit}`}
              style={{ height: 28, minWidth: 50, background: value === null ? "#080808" : `rgba(255,255,255,${0.05+0.3*shade})`, textAlign: "center", fontSize: 10, color: value === null ? "#666" : "#fff" }}>
              {value === null ? "—" : Number(value.toPrecision(3)).toLocaleString("ru-RU")}
            </td>
          })}
        </tr>)}</tbody>
      </table>
    </div>
    <p style={{ fontSize: 11, color: "#b2b2b7", marginTop: 8 }}>{words.note} · {unit}</p>
    {count > 1 ? <nav aria-label={words.pages} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginTop: 10 }}>
      <button type="button" onClick={() => setPage((n) => Math.max(0,n-1))} disabled={currentPage === 0} aria-label="Previous wells" style={{ color: "#fff", opacity: currentPage === 0 ? 0.4 : 1 }}>←</button>
      <span style={{ color: "#ccc", fontSize: 12 }}>{words.pages} {currentPage+1}/{count}</span>
      <button type="button" onClick={() => setPage((n) => Math.min(count-1,n+1))} disabled={currentPage === count-1} aria-label="Next wells" style={{ color: "#fff", opacity: currentPage === count-1 ? 0.4 : 1 }}>→</button>
    </nav> : null}
  </div>
}
