import test from "node:test"
import assert from "node:assert/strict"
import { workTestLoader } from "./work-test-loader.mjs"
const { contextAwareConversationHistory, boundedConversationHistory } = workTestLoader()("lib/ai/conversation-history.ts")
const old = {role:"user",content:"Для VOLTER установили лимит десять фотографий."}
const recent = Array.from({length:22},(_,i)=>({role:i%2?"assistant":"user",content:"Другая тема номер "+i+" "+ "x".repeat(400)}))
const transcript=[old,...recent]
test("older relevant conversation turn is recalled within the same provider budget",()=>{
  const result=contextAwareConversationHistory(transcript,"Какой лимит VOLTER?",14,12000)
  assert.ok(result.some(t=>t.content===old.content))
  assert.equal(result.at(-1).content,recent.at(-1).content)
  assert.ok(result.length<=14)
  assert.ok(result.reduce((n,t)=>n+t.content.length,0)<=12000)
})
test("no match preserves original recent context exactly",()=>{
  assert.deepEqual(contextAwareConversationHistory(transcript,"Объясни фотосинтез",14,12000),boundedConversationHistory(transcript,14,12000))
})
test("no global recall state leaks another conversation",()=>{
  contextAwareConversationHistory(transcript,"Какой лимит VOLTER?",14,12000)
  const separate=contextAwareConversationHistory(recent,"Какой лимит VOLTER?",14,12000)
  assert.ok(separate.every(t=>!t.content.includes("VOLTER")))
})
test("short conversation stays unchanged",()=>{
  assert.deepEqual(contextAwareConversationHistory([old],"VOLTER",14,12000),[old])
})
