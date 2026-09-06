"use client"
import { useState } from "react"
import { calculateEconomics, type EconomicsInput } from "@/lib/business/economics"
import styles from "./AutonomousCompany.module.css"

const fields: Array<[keyof EconomicsInput, string]> = [
  ["price", "Цена единицы"], ["variable", "Переменные затраты на единицу"],
  ["fixed", "Постоянные затраты / месяц"], ["volume", "Продажи / месяц"], ["cash", "Денежный запас"],
]

export function BusinessEconomics({ onApply }: { onApply: (text: string) => void }) {
  const [values, setValues] = useState<Record<keyof EconomicsInput, string>>({ price: "", variable: "", fixed: "", volume: "", cash: "" })
  const input = Object.fromEntries(fields.map(([key]) => [key, Number(values[key])])) as EconomicsInput
  const result = Object.values(values).every((value) => value.trim()) ? calculateEconomics(input) : null
  const format = (value: number) => new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(value)
  return <details className={styles.economics}>
    <summary>Экономика проекта <span>Калькулятор · без вызова ИИ</span></summary>
    <p>Введите свои данные в одной валюте. Это сценарный расчёт до налогов, инвестиций и обслуживания долга, не прогноз.</p>
    <div className={styles.economicsFields}>{fields.map(([key, label]) => <label key={key}>{label}
      <input type="number" min="0" max="1000000000000" step="any" value={values[key]} onChange={(event) => setValues((current) => ({ ...current, [key]: event.target.value }))} />
    </label>)}</div>
    {result ? <>
      <dl className={styles.economicsResults}>
        <div><dt>Выручка / месяц</dt><dd>{format(result.revenue)}</dd></div>
        <div><dt>Операционный результат</dt><dd>{format(result.operatingResult)}</dd></div>
        <div><dt>Безубыточность, единиц / месяц</dt><dd>{result.breakEvenUnits === null ? "Недостижима при этой марже" : format(result.breakEvenUnits)}</dd></div>
        <div><dt>Запас при текущем убытке</dt><dd>{result.runwayMonths === null ? "Нет операционного убытка" : `${format(result.runwayMonths)} мес.`}</dd></div>
      </dl>
      <button type="button" className={styles.ghost} onClick={() => onApply([
        "СЦЕНАРНЫЙ РАСЧЁТ ПОЛЬЗОВАТЕЛЯ (не фактическая отчётность; единая валюта):",
        ...fields.map(([key, label]) => `${label}: ${values[key]}`),
        `Выручка = цена × объём: ${result.revenue}`,
        `Операционный результат = (цена − переменные затраты) × объём − постоянные затраты: ${result.operatingResult}`,
        `Безубыточность, единиц: ${result.breakEvenUnits ?? "недостижима при неположительной марже"}`,
        "Налоги, инвестиции и обслуживание долга не учтены.",
      ].join("\n"))}>Передать расчёт агентам</button>
    </> : <p>Заполните все пять полей неотрицательными числами.</p>}
  </details>
}
