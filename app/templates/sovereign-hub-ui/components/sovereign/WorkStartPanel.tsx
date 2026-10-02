"use client"

import { Code2, FileText, Globe, Layout, Presentation, Table2 } from "lucide-react"

const TASKS = [
  { title: "Документ", description: "Отчёт, письмо или план", icon: FileText, prompt: "Подготовь готовый документ. Тема: " },
  { title: "Таблица", description: "Расчёты, бюджет и данные", icon: Table2, prompt: "Создай таблицу с расчётами и подготовь CSV для скачивания. Задача: " },
  { title: "Презентация", description: "Слайды для выступления", icon: Presentation, prompt: "Создай законченную презентацию с предпросмотром и файлом для скачивания. Тема: " },
  { title: "Исследование", description: "Анализ с источниками", icon: Globe, prompt: "Проведи исследование с проверяемыми источниками и подготовь отчёт. Тема: " },
  { title: "Сайт", description: "Рабочая страница и код", icon: Layout, prompt: "Создай законченный сайт с предпросмотром и всеми файлами для скачивания. Задача: " },
  { title: "Код", description: "Реализация и проверка", icon: Code2, prompt: "Напиши полную реализацию, учти ошибки и приложи инструкции для проверки. Задача: " },
] as const

export function WorkStartPanel({ onChoose }: { onChoose: (prompt: string, research?: boolean) => void }) {
  return <section className="malik-work-start" aria-label="Новая рабочая задача">
    <p className="malik-work-start__eyebrow">Malik AI · Работа</p>
    <h1>Над чем поработаем?</h1>
    <p className="malik-work-start__description">Опиши результат и добавь материалы. Malik AI подготовит файлы, код или исследование, которые можно проверить и использовать.</p>
    <div className="malik-work-start__tasks">
      {TASKS.map(({ title, description, icon: Icon, prompt }) => <button key={title} type="button" onClick={() => onChoose(prompt, title === "Исследование")}>
        <Icon size={20} aria-hidden="true" /><span><strong>{title}</strong><small>{description}</small></span>
      </button>)}
    </div>
    <p className="malik-work-start__hint">Файлы и папки — через «+». Сложные задачи выполняются по шагам, результаты можно открыть и скачать.</p>
  </section>
}
