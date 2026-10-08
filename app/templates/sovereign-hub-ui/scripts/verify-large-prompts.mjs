import assert from "node:assert/strict"
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
console.log("PASS huge prompts: multiple sections, continuation, final marker, original last instructions and bounded budgets")
