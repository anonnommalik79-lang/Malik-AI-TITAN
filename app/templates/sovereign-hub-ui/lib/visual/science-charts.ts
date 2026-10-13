import type { ChartDataset } from "./schema"

/** Real analytical curves for the three deterministic science calculators.
 * Calculated exclusively from the same current input values as their KPI results.
 * No random demo points, external image search, hidden API or model-generated dataset.
 */
export type ScienceCurve = {
  title: string; data: ChartDataset; unit: string; xLabel: string; yLabel: string
}
const R = 8.31446261815324
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value)
const round = (value: number) => Math.round(value * 1e8) / 1e8
const steps = 21
const samples = () => Array.from({ length: steps }, (_, i) => i / (steps - 1))

export function scienceCurve(model: string, inputs: Record<string, number>): ScienceCurve | null {
  if (model === "projectile-motion") {
    const { speed, angleDegrees, gravity } = inputs
    if (![speed, angleDegrees, gravity].every(finite) || speed < 0 || angleDegrees < 0 || angleDegrees > 90 || gravity <= 0) return null
    const theta = angleDegrees * Math.PI / 180
    const duration = 2 * speed * Math.sin(theta) / gravity
    const t = samples().map((ratio) => ratio * duration)
    const labels = t.map((time) => (speed * Math.cos(theta) * time).toFixed(2))
    const height = t.map((time) => Math.max(0, speed * Math.sin(theta) * time - 0.5 * gravity * time * time))
    return {
      title: "Траектория полёта · без сопротивления воздуха",
      unit: "м", xLabel: "Расстояние по горизонтали (м)", yLabel: "Высота (м)",
      data: { labels, series: [{ name: "Высота", values: height.map(round) }] },
    }
  }
  if (model === "ohms-law") {
    const { voltage, resistance } = inputs
    if (![voltage, resistance].every(finite) || voltage < 0 || resistance <= 0) return null
    const u = samples().map((ratio) => voltage * ratio)
    return {
      title: "Ток от напряжения · I = U / R",
      unit: "А", xLabel: "Напряжение (В)", yLabel: "Сила тока (А)",
      data: { labels: u.map((value) => value.toFixed(2)), series: [{ name: "Ток", values: u.map((value) => round(value / resistance)) }] },
    }
  }
  if (model === "ideal-gas") {
    const { moles, temperatureK, pressurePa } = inputs
    if (![moles, temperatureK, pressurePa].every(finite) || moles < 0 || temperatureK <= 0 || pressurePa <= 0) return null
    // Keep nonzero absolute pressure; P from 0.5 × input up to 1.5 × input.
    const pressures = samples().map((ratio) => pressurePa * (0.5 + ratio))
    return {
      title: "Изотерма идеального газа · V = nRT / p",
      unit: "л", xLabel: "Абсолютное давление (кПа)", yLabel: "Объём (л)",
      data: {
        labels: pressures.map((p) => (p / 1000).toFixed(2)),
        series: [{ name: "Объём", values: pressures.map((p) => round(moles * R * temperatureK / p * 1000)) }],
      },
    }
  }
  return null
}
