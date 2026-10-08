import assert from "node:assert/strict"
import fs from "node:fs"
import { mergeStreamingAssistantCheckpoints, restoreInterruptedAssistant } from "../lib/ai/stream-checkpoint.ts"
const chats = [
  {id:"chat1",messages:[
    {id:"q",role:"user",content:"Long prompt"},
    {id:"a",role:"assistant",content:"",isStreaming:true},
    {id:"video",role:"assistant",content:"Video processing",isStreaming:true,generatedMedia:{kind:"video"}}
  ]},
  {id:"chat2",messages:[{id:"other",role:"assistant",content:"Do not touch"}]}
]
const active=[
  {id:"q",role:"user",content:"Long prompt"},
  {id:"a",role:"assistant",content:"The first part of the big answer",isStreaming:true},
  {id:"video",role:"assistant",content:"Other media state",isStreaming:true,generatedMedia:{kind:"video"}}
]
const saved=mergeStreamingAssistantCheckpoints(chats,active)
assert.equal(saved[0].messages[1].content,active[1].content)
assert.equal(saved[0].messages[1].isStreaming,true)
assert.equal(saved[0].messages[2].content,"Video processing")
assert.strictEqual(saved[1],chats[1])
assert.equal(chats[0].messages[1].content,"","immutable input")
assert.deepEqual(mergeStreamingAssistantCheckpoints(chats,[]),chats)
const partial=restoreInterruptedAssistant("First answer",true)
assert.match(partial,/First answer[\s\S]*Перегенерировать/)
assert.equal(restoreInterruptedAssistant(partial,true),partial,"idempotent recovery notice")
assert.equal(restoreInterruptedAssistant("Finished",false),"Finished")
assert.match(restoreInterruptedAssistant("",true),/Ответ был прерван/)
const view=fs.readFileSync("components/sovereign/dashboard.tsx","utf8")
assert.match(view,/mergeStreamingAssistantCheckpoints\(chats, messages\)/)
assert.match(view,/restoreInterruptedAssistant\(/)
assert.match(view,/const receivedBeforeDrop = cleanDashboardAIText\(liveShownText \|\| fullText\)/)
assert.match(view,/finalResearch, connectionCut && !stoppedByUser\)/)
console.log("PASS: partial persistence, reload indicator, error recovery, status honesty, media isolation")
