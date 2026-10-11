/**
 * ```malik-quiz: a knowledge check the chat grades itself.
 *
 *   {"version":1,"title":"…","questions":[
 *     {"question":"…","options":["…","…"],"answer":1,"explanation":"…"}
 *   ]}
 *
 * The correct option comes with the quiz; the chat compares the person's
 * choice with it and shows the score. Nothing here is executable: text only,
 * bounded sizes, and any invalid quiz is rejected as a whole.
 */

export type AnswerQuizQuestion = { question: string; options: string[]; answer: number; explanation?: string }
export type AnswerQuiz = { title: string; questions: AnswerQuizQuestion[] }

const LIMITS = { questions: 20, options: 6, text: 400, title: 120 }

function text(value: unknown, max: number) {
  return typeof value === "string" && value.trim() && value.length <= max ? value.trim() : null
}

export function parseAnswerQuiz(raw: string): AnswerQuiz | null {
  let data: unknown
  try { data = JSON.parse(String(raw || "")) } catch { return null }
  if (!data || typeof data !== "object") return null
  const record = data as Record<string, unknown>
  if (record.version !== undefined && record.version !== 1) return null
  const list = Array.isArray(record.questions) ? record.questions : null
  if (!list || !list.length || list.length > LIMITS.questions) return null
  const questions: AnswerQuizQuestion[] = []
  for (const item of list) {
    if (!item || typeof item !== "object") return null
    const entry = item as Record<string, unknown>
    const question = text(entry.question, LIMITS.text)
    const options = Array.isArray(entry.options) ? entry.options.map((option) => text(option, LIMITS.text)) : []
    if (!question || options.length < 2 || options.length > LIMITS.options || options.some((option) => option === null)) return null
    if (new Set(options.map((option) => option!.toLowerCase())).size !== options.length) return null
    const answer = entry.answer
    if (typeof answer !== "number" || !Number.isInteger(answer) || answer < 0 || answer >= options.length) return null
    const explanation = entry.explanation === undefined ? undefined : text(entry.explanation, LIMITS.text * 2)
    if (entry.explanation !== undefined && !explanation) return null
    questions.push({ question, options: options as string[], answer, ...(explanation ? { explanation } : {}) })
  }
  return { title: text(record.title, LIMITS.title) || "Проверка знаний", questions }
}

/** The score of a set of choices (index per question, null = not answered). */
export function gradeQuiz(quiz: AnswerQuiz, choices: Array<number | null>) {
  const results = quiz.questions.map((question, index) => {
    const choice = choices[index]
    return { answered: choice !== null && choice !== undefined, correct: choice === question.answer }
  })
  return { correct: results.filter((result) => result.correct).length, total: quiz.questions.length, results }
}

/** Plain text for copy, speech and history. */
export function quizToText(quiz: AnswerQuiz) {
  return [quiz.title, ...quiz.questions.map((question, index) => `${index + 1}. ${question.question}\n${question.options.map((option, optionIndex) => `   ${String.fromCharCode(1072 + optionIndex)}) ${option}`).join("\n")}`)].join("\n\n")
}

/** Every ```malik-quiz fence in an answer as readable text (copy, share, speech). */
export function answerQuizzesToText(markdown: string) {
  return String(markdown || "").replace(/```malik-quiz[^\n]*\n([\s\S]*?)\n```/gu, (_whole, body: string) => {
    const quiz = parseAnswerQuiz(body)
    return quiz ? quizToText(quiz) : ""
  })
}
