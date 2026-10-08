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


assert.match(component,/data-malik-chat-sync-warning/, "visible cloud state warning exists")
assert.match(component,/cloudSyncWarning === "not-configured"/, "unconfigured cloud state is explicit")
assert.match(component,/retryCount >= 3/, "write failures show a warning after repeated attempts")
assert.match(component,/hydrationFailures >= 3/, "read failures show a warning after repeated attempts")
assert.match(component,/setCloudSyncWarning\(null\)/, "successful persisted write clears warning")
assert.match(component,/cleanAccountId\(accountId\) !== "guest"/, "guest mode does not show cloud sync banner")
console.log("PASS cloud-chat UX: no silent history loss and no guest warning")

const { claimAccountChatSyncNotice } = await import("../lib/ai/account-chat-sync-retry.ts")
const noticeStorageData = new Map()
const noticeStorage = {
  getItem: (key) => noticeStorageData.get(key) ?? null,
  setItem: (key, value) => { noticeStorageData.set(key, value) },
}
assert.equal(claimAccountChatSyncNotice(noticeStorage, "account-one-time-1", "not-configured"), true, "first account warning is shown")
assert.equal(claimAccountChatSyncNotice(noticeStorage, "account-one-time-1", "not-configured"), false, "repeated failure is suppressed")
assert.equal(claimAccountChatSyncNotice(noticeStorage, "account-one-time-1", "unavailable"), true, "new warning type may show once")
assert.equal(claimAccountChatSyncNotice(noticeStorage, "account-one-time-2", "not-configured"), true, "different account gets its own first warning")
assert.equal(claimAccountChatSyncNotice(noticeStorage, "guest", "not-configured"), false, "guest is never warned")
assert.equal(claimAccountChatSyncNotice(noticeStorage, "", "unavailable"), false, "empty identity is not a user")
assert.equal(claimAccountChatSyncNotice({getItem: () => "1", setItem: () => { throw Error("should not write") }}, "account-seen-from-prior-page-1", "not-configured"), false, "notice remains hidden after page reload")
assert.equal(claimAccountChatSyncNotice({getItem: () => { throw Error("disabled") }, setItem: () => { throw Error("disabled") }}, "account-no-storage-1", "unavailable"), true, "disabled local storage does not hide first warning")
assert.equal(claimAccountChatSyncNotice(null, "account-no-storage-1", "unavailable"), false, "in-memory fallback does not repeat same warning")
assert.match(component, /claimAccountChatSyncNotice\(noticeStorage, accountKey, kind\)/, "component persists once-only marker")
assert.match(component, /warningDismissTimer = window\.setTimeout\(/, "warning expires automatically")
assert.match(component, /window\.clearTimeout\(warningDismissTimer\)/, "warning timer is cleaned up on unmount")
assert.doesNotMatch(component, /setCloudSyncWarning\("(not-configured|unavailable)"\)/, "all cloud failure paths use once-only notice")
console.log("PASS cloud-chat notices: once per account and type, reload persistence, guest/privacy fallback, timed dismiss")
