import assert from "node:assert/strict"
import { fetchRecoverableChat, canRetryChat } from "../lib/ai/chat-stream-recovery.ts"
import {
  briefItems,briefNeedsDeep,briefOutputFloor,briefChecklist,
  missingBriefItems,briefMissingMarker,preserveBriefEdges
} from "../lib/ai/brief-quality.ts"
assert.equal(briefOutputFloor("Привет"),0)
assert.equal(briefNeedsDeep("Привет"),false)
const b=["Выполни все пункты:", "1) Реши пример", "2) Напиши код", "3) Проверь ответ", "4) Выдай итог"].join("\n")
assert.deepEqual(briefItems(b).map(x=>x.number),[1,2,3,4])
assert.equal(briefOutputFloor(b),7000)
assert.equal(briefNeedsDeep(b),true)
assert.match(briefChecklist(b),/4\) Выдай итог/)
assert.deepEqual(missingBriefItems(b,"1) готово\n2) код\n4) итог"),[3])
assert.deepEqual(missingBriefItems(b,"1) a\n2) b\n3) c\n4) d"),[])
assert.deepEqual(missingBriefItems(b,"Развёрнутый связный ответ без нумерации ".repeat(30)),[])
assert.deepEqual(briefItems("Block 1: A; Block 2: B; Block 3: C").map(x=>x.number),[1,2,3])
const ticks=String.fromCharCode(96,96,96)
assert.deepEqual(briefItems("Прочитай код:\n"+ticks+"text\n1) example\n2) sample\n"+ticks),[])
assert.deepEqual(briefItems("Задание:\n"+ticks+"markdown\nBlock 1: code sample\nBlock 2: more code\n"+ticks),[])
assert.equal(briefMissingMarker("В самом конце напиши:\nDONE","пока нет"),true)
assert.equal(briefMissingMarker("В самом конце напиши:\nDONE","DONE"),false)
const huge="BEGIN "+ "source data ".repeat(4000) + "\nMANDATORY LAST LINE: FINAL"
const restored=preserveBriefEdges(huge)
assert.ok(restored.includes("BEGIN") && restored.includes("MANDATORY LAST LINE: FINAL"))
assert.ok(restored.length < huge.length && restored.length < 14200)
assert.equal(briefOutputFloor("x".repeat(20000)),14000)
const many = Array.from({length:55},(_,index)=>String(index+1)+") Task "+(index+1)).join("\n")
assert.equal(briefItems(many).length,55, "55 distinct requirements are tracked")
assert.equal(briefChecklist(many).includes("55) Task 55"),true, "late requirements included in checklists")
const completed = many.split("\n").filter(line=>!line.startsWith("51)")).join("\n")
assert.deepEqual(missingBriefItems(many,completed),[51], "missing item in the tail is detected")
const maxSource = readFileSync("lib/server/malik-max-engine.ts","utf8")
assert.match(maxSource,/if \(spent >= budget - 256\) break/, "MAX continuation obeys the remaining token budget")
console.log("PASS huge prompts: multiple sections, continuation, final marker, original last instructions and bounded budgets")

import { readFileSync } from "node:fs"
const selectedRouter = readFileSync("lib/server/malik-model-router.ts","utf8")
const maxRouter = readFileSync("lib/server/malik-max-engine.ts","utf8")
const dashboard = readFileSync("components/sovereign/dashboard.tsx","utf8")
assert.match(selectedRouter,/missingBriefItems\(input\.taskPrompt \|\| input\.prompt, parsed\.content\)/,"selected model covers numbered requirements")
assert.match(maxRouter,/missingBriefItems\(taskPrompt, content\)/,"MAX code covers numbered requirements")
assert.match(dashboard,/briefOutputFloor\(cleanContent\)/,"UI sends actual adequate token budget")
console.log("PASS large-prompt runtime integration: code, MAX and dashboard")


const frame = (type, content = {}) => "event: " + type + "\ndata: " + JSON.stringify({ type, ...content }) + "\n\n"
const fakeSse = (stream, extra = {}) => new Response(stream, { headers: { "content-type": "text/event-stream", ...extra } })
const retryOptions = { firstTextMs: 80, idleMs: 80, recoveryMs: 100, pollMs: 1 }
const heavyRequest = { method: "POST", body: JSON.stringify({ originalQuestion: many, responseDepth: "deep", maxTokens: 14000 }) }
const calls = []
const transport = await fetchRecoverableChat("/api/stream", heavyRequest, { ...retryOptions, fetcher: async (_url, init) => {
  calls.push(JSON.parse(init.body))
  return calls.length === 1 ? fakeSse(frame("progress", { text: "Анализ" })) : fakeSse(frame("content", { content: "Готово" }) + frame("done"))
} })
assert.match(await transport.text(), /event: done/)
assert.equal(calls.length, 2)
assert.equal(calls[1].responseDepth, "deep")
assert.equal(calls[1].maxTokens, 14000)
assert.equal(calls[1].originalQuestion, many)
assert.equal(canRetryChat({ originalQuestion: "Удалить файл", actionPlan: { kind: "delete" } }), false)
let quotaCalls = 0
const quotaResponse = await fetchRecoverableChat("/api/stream", heavyRequest, { ...retryOptions, fetcher: async () => {
  quotaCalls += 1
  return new Response("Limit reached", { status: 429 })
} })
assert.equal(quotaResponse.status, 429)
assert.equal(quotaCalls, 1)
console.log("PASS long-brief transport: deep settings persist, quota failures are not retried")
