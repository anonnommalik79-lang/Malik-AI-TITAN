import assert from "node:assert/strict"
import fs from "node:fs"
import { accountChatRetryDelay, accountChatWriteConfirmed, shouldRetryAccountChatWrite } from "../lib/ai/account-chat-sync-retry.ts"

assert.equal(accountChatRetryDelay(0),850)
assert.equal(accountChatRetryDelay(1),1700)
assert.equal(accountChatRetryDelay(2),3400)
assert.ok(accountChatRetryDelay(6)<=30000)
assert.equal(accountChatRetryDelay(999),30000)
assert.equal(accountChatRetryDelay(Number.NaN),850)
for (const payload of [null,{}, {ok:true,configured:false,stored:false}, {ok:true,configured:true,stored:false}, {ok:false,configured:true,stored:true}]) {
  assert.equal(accountChatWriteConfirmed(payload),false,"unsaved or unavailable is not synced")
}
assert.equal(accountChatWriteConfirmed({ok:true,configured:true,stored:true,savedAt:"2026-10-08T00:00:00.000Z"}),true)
assert.equal(shouldRetryAccountChatWrite(4,4,false),true)
assert.equal(shouldRetryAccountChatWrite(4,5,false),false,"obsolete snapshot never retries over newer")
assert.equal(shouldRetryAccountChatWrite(4,4,true),false,"unmounted account never retries")
const component=fs.readFileSync("components/sovereign/AccountChatPersistence.tsx","utf8")
assert.match(component,/if \(!accountChatWriteConfirmed\(payload\)\)/)
assert.match(component,/shouldRetryAccountChatWrite\(sentRevision, writeRevision, disposed\)/)
assert.match(component,/accountChatRetryDelay\(retryCount\)/)
assert.match(component,/if \(sentRevision !== writeRevision \|\| disposed\) return/)
assert.doesNotMatch(component,/if \(!response\?\.ok\) \{\s*pendingRaw = nextRaw;\s*return/s)
console.log("PASS cloud-chat sync: actual stored receipt, retry/backoff, newest snapshot priority, account unmount guard")
