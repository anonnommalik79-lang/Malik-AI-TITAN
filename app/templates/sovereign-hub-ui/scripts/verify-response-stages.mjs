// Progress line under «Думаю…»: UI statuses only, driven by observed signals.
import assert from "node:assert/strict"
import fs from "node:fs"
import {
  RESPONSE_STAGES,
  RESPONSE_STAGE_DONE,
  RESPONSE_STAGE_DONE_INDEX,
  responseStageIndex,
  responseStageRows,
  responseStageSignalsFromTrace,
} from "../lib/ai/response-stages.ts"

const idle = { serverSteps: 0, modelStarted: false, writing: false }
assert.deepEqual([...RESPONSE_STAGES], ["Анализирую запрос…", "Определяю задачу…", "Проверяю контекст…", "Формирую ответ…"])
assert.equal(RESPONSE_STAGE_DONE, "Готово")
assert.equal(responseStageIndex({ ...idle, elapsedMs: 0 }), 0)
assert.equal(responseStageIndex({ ...idle, elapsedMs: 1000 }), 1)
assert.equal(responseStageIndex({ ...idle, elapsedMs: 2500 }), 2)
assert.equal(responseStageIndex({ ...idle, elapsedMs: 3500 }), 3)
// Never runs ahead of the answer: the last working stage waits for text.
assert.equal(responseStageIndex({ ...idle, elapsedMs: 60_000 }), 3)
assert.equal(responseStageIndex({ ...idle, elapsedMs: 100, writing: true }), RESPONSE_STAGE_DONE_INDEX)
// Real server signals move it forward early.
assert.equal(responseStageIndex({ ...idle, elapsedMs: 100, serverSteps: 1 }), 2)
assert.equal(responseStageIndex({ ...idle, elapsedMs: 100, serverSteps: 2, modelStarted: true }), 3)

const trace = { version: 1, id: "t", startedAt: 0, state: "running", steps: [
  { id: "m1:request", title: "Отправка запроса", kind: "status", state: "running", startedAt: 0 },
] }
assert.deepEqual(responseStageSignalsFromTrace(trace), { serverSteps: 0, modelStarted: false }, "The client's own «sent» step is not server work")
assert.deepEqual(responseStageSignalsFromTrace({ ...trace, steps: [...trace.steps, { id: "s", title: "Подготовка ответа моделью", kind: "model", state: "running", startedAt: 1 }] }), { serverSteps: 1, modelStarted: true })
assert.deepEqual(responseStageSignalsFromTrace(undefined), { serverSteps: 0, modelStarted: false })

assert.deepEqual(responseStageRows(0).map((row) => [row.label, row.state]), [["Анализирую запрос…", "current"]])
assert.deepEqual(responseStageRows(2).map((row) => row.state), ["done", "done", "current"])
assert.deepEqual(responseStageRows(RESPONSE_STAGE_DONE_INDEX).map((row) => row.label), ["Проверяю контекст…", "Формирую ответ…", "Готово"])
assert(responseStageRows(RESPONSE_STAGE_DONE_INDEX).every((row) => row.state === "done"))

// Wiring: shown only for a live text turn, under the existing thinking label,
// and never pretending to be the model's reasoning.
const execution = fs.readFileSync("components/sovereign/ChatExecution.tsx", "utf8")
const view = fs.readFileSync("components/sovereign/chat-view.tsx", "utf8")
const component = fs.readFileSync("components/sovereign/MalikResponseStages.tsx", "utf8")
assert(execution.indexOf("<MalikLiveActivity />") < execution.indexOf("<MalikResponseStages"), "The progress line sits under «Думаю…»")
assert.match(execution, /stages && live && !writing/)
assert.match(view, /stages=\{!olderVersion && !message\.generatedMedia && !message\.imageConfirmation && !message\.superflow && !videoAnalysis\}/)
assert.doesNotMatch(component, /malik-live-activity/, "A separate element: writing must still remove the waiting label")
assert.doesNotMatch(component, /\.(?:reasoning|thought|thinking|content)\b|legacyThought/, "The component reads no model output or reasoning")
console.log("PASS response stages: UI-only labels, observed signals, never ahead of the answer, wiring")
