import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import { shouldAutonomouslyDecompose, parseAutonomousMissionPlan } from "../lib/ai/autonomy-policy.ts"

const deep = [
  "Проанализируй архитектуру независимой системы обработки задач и предложи законченный проект.",
  "1. Объясни критерии масштабирования.",
  "2. Продумай очереди и идемпотентность.",
  "3. Сравни синхронный и асинхронный методы.",
  "4. Найди слабые места при сбое сети.",
  "5. Проверь аутентификацию между сервисами.",
  "6. Разбери нагрузочные тесты.",
  "7. Вычисли компромиссы по стоимости.",
  "8. Дай измеримые критерии приёмки.",
].join("\n")

test("auto plans are selected by complexity, not a fixed list of tasks", () => {
  assert.equal(shouldAutonomouslyDecompose({ originalQuestion: "Привет" }), false)
  assert.equal(shouldAutonomouslyDecompose({ originalQuestion: "Сколько будет 2+2?" }), false)
  assert.equal(shouldAutonomouslyDecompose({ originalQuestion: deep }), true)
  assert.equal(shouldAutonomouslyDecompose({ originalQuestion: deep, responseDepth: "ultra" }), true)
  assert.equal(shouldAutonomouslyDecompose({ originalQuestion: deep, chatRecovery: true }), false)
})

test("specialized product and side-effect routes cannot be intercepted", () => {
  assert.equal(shouldAutonomouslyDecompose({ originalQuestion: deep, attachments: [{kind: "image"}] }), false)
  assert.equal(shouldAutonomouslyDecompose({ originalQuestion: deep, workspaceMode: "work" }), false)
  assert.equal(shouldAutonomouslyDecompose({ originalQuestion: deep, forceCanvas: true }), false)
  assert.equal(shouldAutonomouslyDecompose({ originalQuestion: deep, isProjectRequest: true }), false)
  assert.equal(shouldAutonomouslyDecompose({ originalQuestion: deep, maxTokens: 300 }), false)
  assert.equal(shouldAutonomouslyDecompose({ originalQuestion: "Создай изображение реалистичного кота и сделай несколько вариантов" }), false)
  assert.equal(shouldAutonomouslyDecompose({ originalQuestion: "Сравни актуальные цены моделей сегодня и покажи источники подробно" }), false)
})

test("provider writes unique, task-specific parallel branches", () => {
  const plan = JSON.stringify({ missions: [
    { kind: "analysis", title: "Масштабирование очереди", detail: "Оценить пропускную способность, сбои и узкие места" },
    { kind: "code", title: "Идемпотентность обработчика", detail: "Предложить контракт дедупликации задач и набор тестов" },
  ] })
  const missions = parseAutonomousMissionPlan(plan)
  assert.equal(missions.length, 2)
  assert.match(missions[0].title, /очереди/)
  assert.match(missions[1].detail, /дедупликации/)
  assert.deepEqual(parseAutonomousMissionPlan("not-json"), [])
  assert.deepEqual(parseAutonomousMissionPlan(JSON.stringify({ missions: [missions[0], missions[0]] })), [])
})

test("model-generated side effects and malformed plans are rejected", () => {
  const forbidden = JSON.stringify({ missions: [
    { kind: "analysis", title: "Отправь сообщение", detail: "Отправь письмо в службу технической поддержки прямо сейчас" },
    { kind: "code", title: "Техническая диагностика", detail: "Проверь модель отказов и расчёт задержек" },
  ] })
  assert.deepEqual(parseAutonomousMissionPlan(forbidden), [])
  assert.deepEqual(parseAutonomousMissionPlan('{"missions":[{"kind":"browser","title":"Browser", "detail":"Go online"}]}'), [])
})

test("auto runtime is actually connected to the primary chat with cancellation", () => {
  const main = fs.readFileSync(new URL("../app/api/stream/route-impl.ts", import.meta.url), "utf8")
  const runtime = fs.readFileSync(new URL("../lib/server/malik-agent-runtime.ts", import.meta.url), "utf8")
  assert.match(main, /prepareAutonomousMalikRuntime\(executionBody, \{ signal, activity \}\)/)
  assert.match(runtime, /Promise\.all\(missions\.map/)
  assert.match(runtime, /allowCatalog: false, signal/)
  assert.match(runtime, /controller\.abort/)
  assert.match(runtime, /formatReports\(runId, reports\)/)
  assert.doesNotMatch(runtime, /autoExecuteShell|eval\(/)
})
