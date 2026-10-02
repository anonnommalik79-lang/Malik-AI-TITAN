"use client"

import { Code2, FileText, Globe, Layout, Presentation, Table2 } from "lucide-react"

const TASKS = [
  { title: "Документ", description: "Текст и редактура", icon: FileText, prompt: "Подготовь готовый документ: раскрой тему, составь структуру и напиши финальный текст. Тема: " },
  { title: "Таблица", description: "Данные и расчёты", icon: Table2, prompt: "Подготовь таблицу с расчётами, укажи допущения и проверь итог. Если доступен инструмент экспорта, приложи файл. Задача: " },
  { title: "Презентация", description: "Сюжет и слайды", icon: Presentation, prompt: "Подготовь содержательную презентацию: структура, тексты слайдов и заметки выступающему. Приложи реальный файл, если доступен экспорт. Тема: " },
  { title: "Исследование", description: "Факты и источники", icon: Globe, prompt: "Проведи исследование: проверь найденные источники, отдели факты от предположений и подготовь итоговый отчёт. Тема: " },
  { title: "Сайт", description: "Код и инструкция запуска", icon: Layout, prompt: "Создай рабочую реализацию сайта с необходимыми файлами, инструкцией запуска и честным отчётом о проверке. Задача: " },
  { title: "Код", description: "Реализация и проверки", icon: Code2, prompt: "Выполни инженерную задачу: дай реализацию, перечисли изменённые файлы, учти крайние случаи и сообщи, какие проверки действительно запускались. Задача: " },
] as const

export function WorkStartPanel({ onChoose }: { onChoose: (prompt: string, research?: boolean) => void }) {
  return <section className="malik-work-start" aria-label="Новая рабочая задача">
    <p className="malik-work-start__eyebrow">Malik Work</p>
    <h1>Над чем поработаем?</h1>
    <p className="malik-work-start__description">Опиши задачу, формат результата и критерий готовности. Можно приложить материалы — Work покажет реальные действия и сохранит результат в переписке.</p>
    <div className="malik-work-start__tasks">
      {TASKS.map(({ title, description, icon: Icon, prompt }) => <button key={title} type="button" onClick={() => onChoose(prompt, title === "Исследование")}>
        <Icon size={20} aria-hidden="true" /><span><strong>{title}</strong><small>{description}</small></span>
      </button>)}
    </div>
    <p className="malik-work-start__hint">Файлы — через «+». Реальные проверки показываются в ходе работы. Если инструмент недоступен, Malik Work прямо укажет ограничение, а не выдаст план за готовый результат.</p>
  </section>
}
