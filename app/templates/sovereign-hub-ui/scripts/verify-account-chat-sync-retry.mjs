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

const api = fs.readFileSync("app/api/chat/state/route.ts", "utf8")
const stateServer = fs.readFileSync("lib/server/account-chat-state.ts", "utf8")
const privateStore = fs.readFileSync("lib/server/private-json-store.ts", "utf8")
assert.match(component,/const hydrateCloud = async \(\): Promise<void> =>/, "hydration retries independently")
assert.match(component,/if \(!response\.ok\) throw new Error\("CHAT_HISTORY_CLOUD_READ_FAILED"\)/, "failed GET does not imply empty cloud")
assert.match(component,/hydrationTimer = window\.setTimeout\(/, "failed cloud GET is retried")
assert.match(component,/if \(hydrationTimer\) window\.clearTimeout\(hydrationTimer\)/, "no retry after unmount")
assert.doesNotMatch(component,/if \(!response\.ok\) \{\s*remoteReady = true/, "no overwrite after failed GET")
assert.match(api,/status: 503,[\s\S]*"Cache-Control": "private, no-store"/, "server fails closed on read outage")
assert.match(stateServer,/throwOnReadError: true/, "account reads opt into strict error reporting")
assert.match(privateStore,/if \(options\?\.throwOnReadError\) throw error/, "unavailable R2 object is not confused with missing")
console.log("PASS cloud-chat GET: freshness preserved, recoverable offline state, strict durable read, bounded retries")
