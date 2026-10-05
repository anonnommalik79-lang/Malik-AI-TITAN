"use client"
import type { WorkEvent } from "@/lib/os/types"
import { formatDuration } from "./os-client"
import "./work-journal.css"
const status: Record<WorkEvent["type"], string> = { "task.created": "Шаг создан", "plan.ready": "План готов", "skill.selected": "Навык выбран", "tool.started": "Инструмент запущен", "tool.retrying": "Повтор", "tool.completed": "Инструмент завершён", "tool.failed": "Ошибка инструмента", "artifact.ready": "Файл готов", "task.completed": "Шаг завершён", "task.failed": "Шаг не выполнен", "task.cancelled": "Шаг остановлен" }
export function WorkJournal({ events }: { events: WorkEvent[] }) {
  if (!events.length) return null
  return <details className="malik-work-journal"><summary>Журнал выполнения · {events.length}</summary><ol>{events.map(event => <li key={event.id}><time dateTime={new Date(event.at).toISOString()}>{new Date(event.at).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</time><div><strong>{status[event.type]}</strong><span>{event.label || event.tool}{event.tool && event.label ? ` · ${event.tool}` : ""}{event.attempt ? ` · попытка ${event.attempt}` : ""}</span>{event.error ? <span>{event.error}</span> : null}</div>{event.durationMs !== undefined ? <small>{formatDuration(event.durationMs)}</small> : null}</li>)}</ol></details>
}
