import assert from "node:assert/strict"
import fs from "node:fs"
import { mergeAccountChatStates } from "../lib/ai/account-chat-state-merge.ts"

const a={activeChatId:"chat-a",chats:[{id:"chat-a",title:"Phone",messages:[{id:"u1",role:"user",content:"Phone",timestamp:"2026-10-08T09:00:00Z"},{id:"a1",role:"assistant",content:"partial",isStreaming:true}]}]}
const b={activeChatId:"chat-b",chats:[{id:"chat-b",title:"PC",messages:[{id:"u2",role:"user",content:"PC",timestamp:"2026-10-08T09:01:00Z"}]}]}
const merged=mergeAccountChatStates(a,b)
assert.deepEqual(merged.chats.map(x=>x.id),["chat-b","chat-a"])
assert.equal(merged.activeChatId,"chat-b")
assert.equal(merged.chats[0].messages[0].content,"PC")
assert.equal(merged.chats[1].messages[0].content,"Phone")
assert.equal(a.chats.length,1,"input never mutated")
const completed=mergeAccountChatStates(a,{chats:[{id:"chat-a",messages:[{id:"a1",role:"assistant",content:"complete",isStreaming:false}]}]})
assert.equal(completed.chats[0].messages.filter(x=>x.id==="a1").length,1)
assert.equal(completed.chats[0].messages.find(x=>x.id==="a1").content,"complete")
const stale=mergeAccountChatStates({chats:[{id:"chat-a",messages:[{id:"a1",role:"assistant",content:"long complete answer",isStreaming:false}]}]},
{chats:[{id:"chat-a",messages:[{id:"a1",role:"assistant",content:"old",isStreaming:true}]}]})
assert.equal(stale.chats[0].messages[0].content,"long complete answer","stale partial may not erase completed message")
const removed=mergeAccountChatStates({...a,deletedChatIds:["chat-b"]},b)
assert.deepEqual(removed.chats.map(x=>x.id),["chat-a"],"deletion survives stale desktop")
assert.deepEqual(removed.deletedChatIds,["chat-b"])
const alt=mergeAccountChatStates(
{chats:[{id:"x",messages:[{id:"a",role:"assistant",content:"old answer",isStreaming:false}]}]},
{chats:[{id:"x",messages:[{id:"a",role:"assistant",content:"new answer",isStreaming:false}]}]},
)
assert.equal(alt.chats[0].messages[0].content,"new answer")
assert.equal(alt.chats[0].messages[0].versions.at(-1).content,"old answer")
const server=fs.readFileSync("lib/server/account-chat-state.ts","utf8")
const storage=fs.readFileSync("lib/server/private-json-store.ts","utf8")
assert.match(server,/writePrivateJsonConditional\(/)
assert.match(server,/readPrivateJsonVersioned/)
assert.match(server,/mergeAccountChatStates\(current\.value\?\.state \?\? null,state\)/)
assert.match(storage,/request\.headers\[previousEtag \? "if-match" : "if-none-match"\]/)
assert.match(storage,/status===412 \|\| status===409/)
console.log("PASS conflict-safe cloud history: device union, deletion markers, complete answers, guarded CAS and retries")

const dashboard=fs.readFileSync("components/sovereign/dashboard.tsx","utf8")
const client=fs.readFileSync("components/sovereign/AccountChatPersistence.tsx","utf8")
assert.match(dashboard,/setDeletedChatIds\(prev => \[\.\.\.new Set\(\[\.\.\.prev, chatId\]\)\]\.slice\(-1000\)\)/,
  "explicit user delete records account-scoped tombstone")
assert.match(dashboard,/deletedChatIds,\s*\}\)/,"snapshot transmits deletion tombstones")
assert.match(dashboard,/setDeletedChatIds\(parsed\.deletedChatIds/,"reload restores tombstones")
assert.match(client,/mergeAccountChatStates\(remoteState, localState\)/,
  "device hydration never simply discards remote or local chat history")
assert.doesNotMatch(client,/window\.localStorage\.setItem\(savedAtKey, new Date\(\)\.toISOString\(\)\)/,
  "unsaved local revisions are not falsely acknowledged as cloud-persisted")
console.log("PASS client history convergence: merge on open, persisted tombstones, accurate cloud savedAt")
