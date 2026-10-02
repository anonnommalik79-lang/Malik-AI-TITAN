"use client"

import { Code2, FileCheck2, FileSearch, FileText, FolderGit2, Globe, Layout, Presentation, Table2 } from "lucide-react"

const TASKS = [
  { title: "Документ", description: "Готовый отчёт или предложение", icon: FileText, prompt: "Подготовь законченный документ. Задача: " },
  { title: "Таблица", description: "Расчёты, бюджет, данные", icon: Table2, prompt: "Составь таблицу с формулами и результатом, предоставь CSV или настоящий файл, если доступен инструмент. Задача: " },
  { title: "Презентация", description: "Слайды и структура выступления", icon: Presentation, prompt: "Подготовь презентацию с проверенным содержанием и предпросмотром, если доступен инструмент. Тема: " },
  { title: "Исследование", description: "Источники, выводы, ограничения", icon: Globe, prompt: "Проведи исследование с доступными проверяемыми источниками; отдели факты от предположений. Тема: " },
  { title: "Сайт", description: "Интерфейс, адаптивность, исходники", icon: Layout, prompt: "Разработай рабочую страницу с адаптивной версткой, полным исходным кодом и проверкой доступными инструментами. Задача: " },
  { title: "Код", description: "Реализация, тесты, исправления", icon: Code2, prompt: "Выполни инженерную задачу: изучи доступный контекст, подготовь код и проверь доступными инструментами. Задача: " },
  { title: "GitHub", description: "Файлы, изменения и проверки", icon: FolderGit2, prompt: "Проверь доступный репозиторий, составь план, внеси разрешенные изменения, запусти доступные проверки. Не заявляй о коммите или push без подтверждения GitHub. Задача: " },
  { title: "Анализ файла", description: "Извлечь главное и подготовить итог", icon: FileSearch, prompt: "Разбери приложенный файл, найди важные детали и подготовь проверяемый результат. Задача: " },
  { title: "Проверка", description: "Ревью готового результата", icon: FileCheck2, prompt: "Проверь результат по требованиям, найди ошибки и перечисли лишь реально выполненные проверки. Материал или задача: " },
] as const

export function WorkStartPanel({ onChoose }: { onChoose: (prompt: string, research?: boolean) => void }) {
  return <section className="malik-work-start" aria-label="Новая рабочая задача">
    <p className="malik-work-start__eyebrow">Malik Work</p>
    <h1>Над чем поработаем?</h1>
    <p className="malik-work-start__description">Опиши результат, приложи материалы или выбери задачу. Ход работы и реальные проверки появятся рядом с ответом.</p>
    <div className="malik-work-start__tasks">
      {TASKS.map(({ title, description, icon: Icon, prompt }) => <button key={title} type="button" onClick={() => onChoose(prompt, title === "Исследование")}>
        <Icon size={20} aria-hidden="true" /><span><strong>{title}</strong><small>{description}</small></span>
      </button>)}
    </div>
    <p className="malik-work-start__hint">Материалы — через «+». Для сложных задач Work покажет этапы, результат и ограничения без придуманного процента готовности.</p>
  </section>
}
