"use client"

import { useEffect, useId, useState } from "react"
import { Check, RotateCcw, X } from "lucide-react"
import { gradeQuiz, type AnswerQuiz } from "@/lib/ai/answer-quiz"
import "./answer-blocks.css"

const STORE = "malik-quiz-v1:"

/**
 * A knowledge check inside an answer. The person picks options, «Проверить»
 * grades them against the quiz's own answers, «Пройти заново» clears them.
 * Choices survive a re-render of the chat for this tab (sessionStorage).
 */
export function MalikAnswerQuiz({ quiz, stateKey }: { quiz: AnswerQuiz; stateKey?: string }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "")
  const [choices, setChoices] = useState<Array<number | null>>(() => quiz.questions.map(() => null))
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    if (!stateKey) return
    try {
      const saved = JSON.parse(window.sessionStorage.getItem(STORE + stateKey) || "null")
      if (saved && Array.isArray(saved.choices) && saved.choices.length === quiz.questions.length) {
        setChoices(saved.choices.map((value: unknown) => typeof value === "number" ? value : null))
        setChecked(saved.checked === true)
      }
    } catch {}
  }, [stateKey, quiz.questions.length])

  const remember = (nextChoices: Array<number | null>, nextChecked: boolean) => {
    if (!stateKey) return
    try { window.sessionStorage.setItem(STORE + stateKey, JSON.stringify({ choices: nextChoices, checked: nextChecked })) } catch {}
  }
  const choose = (question: number, option: number) => {
    if (checked) return
    const next = choices.map((value, index) => index === question ? option : value)
    setChoices(next)
    remember(next, false)
  }
  const grade = gradeQuiz(quiz, choices)
  const answered = grade.results.filter((result) => result.answered).length

  return <section className="malik-answer-quiz" data-malik-quiz aria-labelledby={`${id}-title`}>
    <header className="malik-answer-quiz__header">
      <h3 id={`${id}-title`}>{quiz.title}</h3>
      <span>{checked ? `${grade.correct} из ${grade.total} верно` : `${answered} из ${grade.total} отвечено`}</span>
    </header>
    <ol className="malik-answer-quiz__questions">
      {quiz.questions.map((question, questionIndex) => {
        const result = grade.results[questionIndex]
        return <li key={questionIndex} className={checked ? (result.correct ? "is-correct" : "is-wrong") : undefined}>
          <fieldset>
            <legend>{question.question}</legend>
            {question.options.map((option, optionIndex) => {
              const picked = choices[questionIndex] === optionIndex
              const right = checked && optionIndex === question.answer
              const wrongPick = checked && picked && !right
              return <label key={optionIndex} className={`malik-answer-quiz__option${picked ? " is-picked" : ""}${right ? " is-right" : ""}${wrongPick ? " is-wrong-pick" : ""}`}>
                <input type="radio" name={`${id}-q${questionIndex}`} checked={picked} disabled={checked} onChange={() => choose(questionIndex, optionIndex)} />
                <span>{option}</span>
                {right ? <Check aria-label="верный ответ" /> : wrongPick ? <X aria-label="неверно" /> : null}
              </label>
            })}
            {checked ? <p className="malik-answer-quiz__verdict" role="status">
              {result.correct ? "Верно." : result.answered ? `Неверно. Правильный ответ: ${question.options[question.answer]}.` : `Нет ответа. Правильный ответ: ${question.options[question.answer]}.`}
              {question.explanation ? ` ${question.explanation}` : ""}
            </p> : null}
          </fieldset>
        </li>
      })}
    </ol>
    <footer className="malik-answer-quiz__actions">
      {checked
        ? <button type="button" onClick={() => { const empty = quiz.questions.map(() => null); setChoices(empty); setChecked(false); remember(empty, false) }}><RotateCcw aria-hidden="true" /> Пройти заново</button>
        : <button type="button" disabled={!answered} onClick={() => { setChecked(true); remember(choices, true) }}><Check aria-hidden="true" /> Проверить</button>}
    </footer>
  </section>
}
