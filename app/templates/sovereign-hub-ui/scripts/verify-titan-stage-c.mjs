// TITAN Stage C — code views, heatmaps and quizzes: the pure rules.
//
//   npm run test:titan-stage-c
//
// Rendering is covered by test:answer-format; the browser by
// test:titan-stage-c-live. Here: what counts as a diff, a before/after pair,
// a project tree, a heatmap and a valid quiz, and how a quiz is graded.
import assert from "node:assert/strict"
import fs from "node:fs"

const views = await import("../lib/ai/answer-code-views.ts")
const quizzes = await import("../lib/ai/answer-quiz.ts")
const skills = await import("../lib/ai/chat-artifact-skills.ts")

let count = 0
let failures = 0
async function check(name, fn) {
  count += 1
  try {
    await fn()
    console.log(`  ok  ${name}`)
  } catch (error) {
    failures += 1
    console.log(`  FAIL ${name}\n       ${String(error?.stack || error).split("\n").slice(0, 4).join("\n       ")}`)
  }
}

await check("diff lines and diff detection", () => {
  assert.deepEqual(["--- a/x", "+++ b/x", "@@ -1 +1 @@", "+new", "-old", " same", "diff --git a/x b/x"].map(views.diffLineKind), ["meta", "meta", "hunk", "add", "del", "same", "meta"])
  assert.equal(views.isUnifiedDiff("diff", "+a"), true)
  assert.equal(views.isUnifiedDiff("", "@@ -1,2 +1,2 @@\n-a\n+b"), true, "an unlabelled patch is still a patch")
  assert.equal(views.isUnifiedDiff("markdown", "- пункт один\n- пункт два"), false, "a Markdown list is not a diff")
  assert.equal(views.isUnifiedDiff("js", "x = a - b\ny = +c"), false)
  assert.deepEqual(views.diffStats("--- a\n+++ b\n@@ -1 +1 @@\n-x\n+y\n+z"), { added: 2, removed: 1 })
})

await check("«Было» / «Стало» labels in RU, KK and EN", () => {
  for (const label of ["Было:", "**До исправления**", "Исходный код", "Before", "Old version", "Бұрынғы код"]) assert.equal(views.beforeAfterLabel(label), "before", label)
  for (const label of ["Стало:", "Исправленный код", "После рефакторинга", "After:", "Fixed version", "Түзетілген код"]) assert.equal(views.beforeAfterLabel(label), "after", label)
  for (const label of ["Пример", "Установка", "До и после", "Документация", "Подробнее о новостях"]) assert.equal(views.beforeAfterLabel(label), null, label)
  assert.equal(views.beforeAfterLabel("Было ".repeat(30)), null, "long prose is not a label")
})

await check("project trees: nesting, comments, spacer lines; ordinary text is not a tree", () => {
  const tree = views.parseTextTree("app/\n├── src/\n│   ├── main.py    # запуск\n│   │\n│   └── db/\n│       └── models.py\n│\n└── requirements.txt")
  assert.equal(tree.length, 1)
  const [root] = tree
  assert.equal(root.name, "app")
  assert.equal(root.directory, true)
  assert.deepEqual(root.children.map((node) => node.name), ["src", "requirements.txt"])
  const src = root.children[0]
  assert.deepEqual(src.children.map((node) => [node.name, node.directory]), [["main.py", false], ["db", true]])
  assert.equal(src.children[0].comment, "запуск")
  assert.equal(src.children[1].children[0].name, "models.py")
  assert.equal(views.parseTextTree("npm install\nnpm run dev\nnpm test"), null)
  assert.equal(views.parseTextTree("├── one"), null, "too short to be a tree")
})

await check("heatmaps only when the answer calls it one; shades are greys", () => {
  const headers = ["Час", "Пн", "Вт"]
  const rows = [["9:00", "1", "5"], ["12:00", "3", "9"]]
  assert.equal(views.heatmapTable(headers, rows, "Загрузка по дням"), null)
  const heatmap = views.heatmapTable(headers, rows, "Тепловая карта загрузки")
  assert.deepEqual([heatmap.min, heatmap.max], [1, 9])
  assert.deepEqual(views.heatShade(1, heatmap), { background: "rgb(28, 28, 28)", color: "#fff" })
  assert.deepEqual(views.heatShade(9, heatmap), { background: "rgb(224, 224, 224)", color: "#000" })
  assert.ok(views.heatmapTable(["", "A", "B"], [["A", "1", "0.8"], ["B", "0.8", "1"]], "Корреляция метрик"), "a correlation matrix counts")
  assert.equal(views.heatmapTable(headers, [["9:00", "мало", "много"], ["12:00", "?", "-"]], "Тепловая карта"), null, "words are not shaded")
  assert.equal(views.heatmapTable(headers, [["9:00", "2", "2"], ["12:00", "2", "2"]], "Тепловая карта"), null, "no range, no shading")
})

const valid = { version: 1, title: "Химия", questions: [
  { question: "Символ кислорода?", options: ["O", "K", "Ox"], answer: 0, explanation: "Oxygenium." },
  { question: "H2O — это?", options: ["Соль", "Вода"], answer: 1 },
] }

await check("quizzes: valid ones parse, anything doubtful is rejected whole", () => {
  const quiz = quizzes.parseAnswerQuiz(JSON.stringify(valid))
  assert.equal(quiz.title, "Химия")
  assert.equal(quiz.questions.length, 2)
  const broken = [
    "{not json",
    JSON.stringify({ ...valid, version: 2 }),
    JSON.stringify({ questions: [] }),
    JSON.stringify({ questions: [{ question: "?", options: ["a", "b"], answer: 2 }] }),
    JSON.stringify({ questions: [{ question: "?", options: ["a", "b"], answer: 0.5 }] }),
    JSON.stringify({ questions: [{ question: "?", options: ["a"], answer: 0 }] }),
    JSON.stringify({ questions: [{ question: "?", options: ["Да", "да"], answer: 0 }] }),
    JSON.stringify({ questions: [{ question: "?", options: ["a", 3], answer: 0 }] }),
    JSON.stringify({ questions: Array.from({ length: 21 }, () => ({ question: "?", options: ["a", "b"], answer: 0 })) }),
    JSON.stringify({ questions: [{ question: "x".repeat(401), options: ["a", "b"], answer: 0 }] }),
  ]
  for (const raw of broken) assert.equal(quizzes.parseAnswerQuiz(raw), null, raw.slice(0, 60))
  assert.equal(quizzes.parseAnswerQuiz(JSON.stringify({ questions: valid.questions })).title, "Проверка знаний")
})

await check("grading compares each choice with the quiz's own answer", () => {
  const quiz = quizzes.parseAnswerQuiz(JSON.stringify(valid))
  assert.deepEqual(quizzes.gradeQuiz(quiz, [0, 1]).correct, 2)
  const partial = quizzes.gradeQuiz(quiz, [2, null])
  assert.equal(partial.correct, 0)
  assert.deepEqual(partial.results, [{ answered: true, correct: false }, { answered: false, correct: false }])
})

await check("a quiz copies and shares as readable text, without its answers", () => {
  const text = quizzes.answerQuizzesToText("Тест:\n\n```malik-quiz\n" + JSON.stringify(valid) + "\n```\n\nУдачи!")
  assert.match(text, /Химия\n\n1\. Символ кислорода\?\n {3}а\) O/)
  assert.doesNotMatch(text, /"answer"|malik-quiz|Oxygenium/)
  assert.match(text, /Удачи!$/)
  assert.equal(quizzes.answerQuizzesToText("```malik-quiz\n{bad}\n```"), "")
})

await check("the model is told how to write a quiz when one is asked for", () => {
  for (const prompt of ["Сделай тест по биологии на 5 вопросов", "Сделай викторину по истории Казахстана", "make a quiz about Python"]) {
    const found = skills.detectChatArtifactSkills(prompt)
    assert.ok(found.some((skill) => skill.id === "education"), prompt)
  }
  const source = fs.readFileSync("lib/ai/chat-artifact-skills.ts", "utf8")
  assert.match(source, /```malik-quiz fence/)
})

await check("answers with live blocks are never turned into dead A/B copies", () => {
  const runtime = fs.readFileSync("components/sovereign/MalikCognitiveResponseRuntime.tsx", "utf8")
  assert.match(runtime, /markdown\.querySelector\("\[data-malik-visual-engine\], \.malik-answer-checklist, \[data-malik-quiz\]"\)\) return false/)
})

console.log(failures ? `\n${failures}/${count} checks FAILED` : `\n${count}/${count} checks passed`)
process.exit(failures ? 1 : 0)
