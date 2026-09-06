import { test, beforeEach, after } from "node:test"
import assert from "node:assert/strict"
import { NextRequest } from "next/server.js"
import { seal, unseal, nonce, validState, hash, SCOPE } from "../lib/youtube/security.ts"
import { shortsPath, durationSeconds } from "../lib/youtube/contracts.ts"
import { youtube, oauthConfig } from "../lib/youtube/client.ts"
import { GET, POST, PATCH, DELETE } from "../app/api/youtube/[...path]/route.ts"
import { GET as connect } from "../app/api/youtube/connect/route.ts"
import { GET as callback } from "../app/api/youtube/callback/route.ts"
import { POST as writeHistory } from "../app/api/shorts/history/route.ts"
import { mapChannel, mapComment } from "../lib/youtube/resources.ts"

const originalFetch = globalThis.fetch
const user = "workos_test_owner", videoId = "abcdefghijk", channelId = "UC" + "a".repeat(22)
let row, requests, responder, grantCount, deniedToken, replay, playlist, rating
const channel = { id: channelId, snippet: { title: "Test fixture channel", customUrl: "@test", thumbnails: { default: { url: "https://example.test/avatar.jpg" } } }, statistics: { subscriberCount: "123", videoCount: "4" }, contentDetails: { relatedPlaylists: { uploads: "UUtest" } } }
const resource = { id: videoId, snippet: { title: "Test fixture video", channelId, channelTitle: "Test fixture channel", publishedAt: "2026-09-01T00:00:00Z" }, contentDetails: { duration: "PT45S" }, statistics: { viewCount: "999", likeCount: "42", commentCount: "3" } }
const reply = (value, status = 200) => status === 204 ? new Response(null, { status }) : Response.json(value, { status })
beforeEach(() => {
  Object.assign(process.env, { YOUTUBE_TOKEN_ENCRYPTION_KEY: "11".repeat(32), GOOGLE_YOUTUBE_CLIENT_ID: "test-client", GOOGLE_YOUTUBE_CLIENT_SECRET: "test-secret", GOOGLE_YOUTUBE_REDIRECT_URI: "https://malik.test/api/youtube/callback", SUPABASE_URL: "https://db.test", SUPABASE_SERVICE_ROLE_KEY: "test-db", YOUTUBE_API_KEY: "test-key" })
  globalThis.__youtubeTestUser = user; requests = []; responder = null; grantCount = 0; deniedToken = false; replay = false; playlist = false; rating = "none"
  row = { workos_user_id: user, access_encrypted: seal("test-access", user), refresh_encrypted: seal("test-refresh", user), expires_at: new Date(Date.now() + 3600000).toISOString(), scopes: [SCOPE], channel_id: channelId, channels: [mapChannel(channel)], saved_playlist_id: null, updated_at: new Date().toISOString() }
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input)); requests.push({ url, init })
    if (responder) { const custom = await responder(url, init); if (custom) return custom }
    if (url.hostname === "db.test") {
      const path = url.pathname.split("/").pop()
      if (path === "youtube_connections") {
        if (init.method === "PATCH") { Object.assign(row, JSON.parse(init.body)); return reply(null, 204) }
        if (init.method === "POST") { Object.assign(row, JSON.parse(init.body)); return reply(null, 204) }
        if (init.method === "DELETE") { row = null; return reply(null, 204) }
        return reply(row ? [row] : [])
      }
      if (path === "youtube_acquire_lock" || path === "youtube_take_budget") return reply(true)
      if (path === "youtube_oauth_states" && init.method === "DELETE" && url.searchParams.has("state_hash")) {
        if (replay) return reply([]); replay = true
        return reply([{ verifier_encrypted: seal("test-verifier", user), return_path: "/shorts?view=following" }])
      }
      return reply(null, 204)
    }
    if (url.pathname === "/token") { grantCount++; return reply({ access_token: "refreshed-test", refresh_token: "new-refresh", expires_in: 3600, scope: SCOPE }) }
    if (url.pathname === "/revoke") return reply({})
    if (deniedToken && init.headers?.Authorization === "Bearer test-access") return reply({ error: { errors: [{ reason: "authError" }] } }, 401)
    if (url.pathname.endsWith("videos/rate")) { rating = url.searchParams.get("rating"); return reply(null, 204) }
    if (url.pathname.endsWith("videos/getRating")) return reply({ items: [{ videoId, rating }] })
    if (url.pathname.endsWith("videos")) return reply({ items: [resource] })
    if (url.pathname.endsWith("channels")) return reply({ items: [channel] })
    if (url.pathname.endsWith("subscriptions")) return reply({ items: [] })
    if (url.pathname.endsWith("playlists")) { if (init.method === "POST") { playlist = true; return reply({ id: "PLtest" }) } return reply({ items: [] }) }
    if (url.pathname.endsWith("playlistItems")) return init.method === "POST" ? reply({ id: "item-test" }) : reply({ items: [] })
    if (url.pathname.endsWith("commentThreads")) return reply({ id: "thread-test", snippet: { topLevelComment: { id: "comment-test", snippet: { textOriginal: "Test comment", authorChannelId: { value: channelId }, publishedAt: "2026-09-01", updatedAt: "2026-09-01" } } } })
    if (url.pathname.endsWith("comments")) return reply({ items: [{ id: "foreign-comment", snippet: { authorChannelId: { value: "UC" + "b".repeat(22) } } }] })
    throw new Error("Unexpected test endpoint " + url.pathname)
  }
})
after(() => { globalThis.fetch = originalFetch; delete globalThis.__youtubeTestUser })
const request = (path, method = "GET", body, headers = {}) => new NextRequest("https://malik.test/api/youtube/" + path, { method, headers: { origin: "https://malik.test", "content-type": "application/json", ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
const run = (path, method = "GET", body, headers) => (method === "GET" ? GET : method === "PATCH" ? PATCH : method === "DELETE" ? DELETE : POST)(request(path, method, body, headers), { params: Promise.resolve({ path: path.split("?")[0].split("/") }) })

test("AES-GCM random IV, owner binding and tamper rejection", () => { const a = seal("token", user), b = seal("token", user); assert.notEqual(a, b); assert.equal(unseal(a, user), "token"); assert.throws(() => unseal(a, "other-user")); assert.throws(() => unseal(a.slice(0, -2) + "xx", user)); assert.ok(!a.includes("token")) })
test("State timing-safe check and safe deep-link allowlist", () => { const state = nonce(); assert.equal(state.length, 43); assert.ok(validState(state, state)); assert.ok(!validState("", "")); assert.ok(!validState(state, nonce())); assert.equal(hash(state).length, 43); assert.equal(shortsPath("//evil.test"), "/shorts"); assert.equal(shortsPath("/shorts/youtube/" + videoId), "/shorts/youtube/" + videoId) })
test("Invalid key/config never accepted", () => { process.env.YOUTUBE_TOKEN_ENCRYPTION_KEY = "short"; assert.throws(oauthConfig); process.env.YOUTUBE_TOKEN_ENCRYPTION_KEY = "11".repeat(32); process.env.GOOGLE_YOUTUBE_REDIRECT_URI = "ftp://localhost/api/youtube/callback"; assert.throws(oauthConfig) })
test("Durations and hidden/missing statistics are not fake zeros", () => { assert.equal(durationSeconds("PT1H2M3S"), 3723); assert.equal(mapChannel({ id: channelId }).subscribers, undefined); assert.equal(mapChannel({ ...channel, statistics: { subscriberCount: "123", hiddenSubscriberCount: true } }).subscribers, undefined); assert.equal(mapComment({ id: "c", snippet: {} }, channelId).likes, undefined) })
test("Anonymous request stops before database or YouTube", async () => { globalThis.__youtubeTestUser = null; assert.equal((await run("me")).status, 401); assert.equal(requests.length, 0) })
test("CSRF mutation rejected before API access", async () => { const r = await run(`videos/${videoId}/rating`, "POST", { rating: "like" }, { origin: "https://evil.test" }); assert.equal(r.status, 403); assert.equal(requests.length, 0) })
test("Missing connection returns connect state, not fabricated account", async () => { row = null; const r = await run("me"); assert.deepEqual(await r.json(), { connected: false }) })
test("Owner comes only from WorkOS, never submitted body", async () => { await run(`videos/${videoId}/rating`, "POST", { rating: "like", workos_user_id: "victim" }); const reads = requests.filter(({url}) => url.pathname.endsWith("youtube_connections")); assert.ok(reads.every(({url}) => url.searchParams.get("workos_user_id") === "eq." + user)) })
test("Expired token refreshes once for concurrent requests", async () => { row.expires_at = new Date(0).toISOString(); await Promise.all([youtube(user, "videos"), youtube(user, "channels")]); assert.equal(grantCount, 1); assert.equal(unseal(row.refresh_encrypted, user), "new-refresh") })
test("401 refresh + single retry", async () => { deniedToken = true; await youtube(user, "videos"); assert.equal(grantCount, 1); assert.equal(requests.filter(({url}) => url.pathname.endsWith("videos")).length, 2) })
test("Repeated 401 terminates and requests reconnect", async () => { responder = (url) => url.pathname.endsWith("videos") ? reply({ error: {} }, 401) : null; await assert.rejects(youtube(user, "videos"), { code: "YOUTUBE_RECONNECT_REQUIRED" }); assert.equal(grantCount, 1) })
test("Revoked refresh token is explicit reconnect", async () => { row.expires_at = new Date(0).toISOString(); responder = (url) => url.pathname === "/token" ? reply({ error: "invalid_grant" }, 400) : null; const r = await run("me"); assert.equal(r.status, 401); assert.equal((await r.json()).reconnect, true) })
test("Like writes official endpoint and reconciles real rating", async () => { const r = await run(`videos/${videoId}/rating`, "POST", { rating: "like" }); assert.equal(r.status, 200); const data = await r.json(); assert.equal(data.video.rating, "like"); assert.equal(data.video.likes, 42); assert.ok(requests.some(({url,init}) => url.pathname.endsWith("videos/rate") && init.method === "POST")) })
test("Failed like returns failure for client rollback", async () => { responder = (url) => url.pathname.endsWith("videos/rate") ? reply({ error: { errors: [{ reason: "videoRatingDisabled" }] } }, 403) : null; const r = await run(`videos/${videoId}/rating`, "POST", { rating: "like" }); assert.equal(r.status, 403); assert.equal((await r.json()).error, "videoRatingDisabled") })
test("Successful write is not reported failed when reconcile fails", async () => { responder = (url) => url.pathname.endsWith("videos") ? reply({ error: {} }, 503) : null; const r = await run(`videos/${videoId}/rating`, "POST", { rating: "like" }); const data = await r.json(); assert.equal(r.status, 200); assert.equal(data.needsRefresh, true); assert.equal(data.rating, "like") })
test("Comment uses returned YouTube ID, not local DB", async () => { const r = await run(`videos/${videoId}/comments`, "POST", { text: "Test comment" }); const data = await r.json(); assert.equal(r.status, 201); assert.equal(data.item.id, "comment-test"); assert.equal(data.item.own, true); assert.ok(!requests.some(({url}) => url.pathname.includes("malik_shorts_comments"))) })
test("Foreign comment edit is forbidden before PUT", async () => { const r = await run("comments/foreign-comment", "PATCH", { text: "change" }); assert.equal(r.status, 403); assert.ok(!requests.some(({init}) => init.method === "PUT")) })
test("Saved creates private playlist then inserts real video", async () => { const r = await run(`videos/${videoId}/saved`, "POST", { saved: true }); assert.equal(r.status, 200); assert.equal(playlist, true); assert.equal(row.saved_playlist_id, "PLtest"); const create = requests.find(({url,init}) => url.pathname.endsWith("playlists") && init.method === "POST"); assert.equal(JSON.parse(create.init.body).status.privacyStatus, "private") })
test("Quota rejection is graceful and makes no Google call", async () => { responder = (url) => url.pathname.endsWith("youtube_take_budget") ? reply(false) : null; const r = await run("feed"); assert.equal(r.status, 429); assert.ok(!requests.some(({url}) => url.hostname.includes("google"))) })
test("History clamps progress and binds authenticated owner", async () => { const r = await writeHistory(request("unused", "POST", { videoId, progress: 90, workos_user_id: "victim" })); assert.equal(r.status, 200); const insert = requests.find(({url,init}) => url.pathname.endsWith("shorts_history") && init.method === "POST"); const data = JSON.parse(insert.init.body); assert.equal(data.workos_user_id, user); assert.equal(data.progress_seconds, 45); assert.equal(data.completed, true) })
test("OAuth connect uses PKCE + offline scope + httpOnly state", async () => { const r = await connect(new NextRequest("https://malik.test/api/youtube/connect?returnTo=//evil.test")); const url = new URL(r.headers.get("location")); assert.equal(url.hostname, "accounts.google.com"); assert.equal(url.searchParams.get("scope"), SCOPE); assert.equal(url.searchParams.get("access_type"), "offline"); assert.equal(url.searchParams.get("code_challenge_method"), "S256"); assert.match(r.headers.get("set-cookie"), /HttpOnly/i); assert.ok(!url.toString().includes("test-secret")) })
test("OAuth callback rejects wrong state before token exchange", async () => { const r = await callback(new NextRequest("https://malik.test/api/youtube/callback?code=test&state=" + nonce())); assert.equal(r.status, 403); assert.equal(grantCount, 0) })
test("Denied consent preserves safe return query; replay rejected", async () => { const state = nonce(); const req = () => new NextRequest(`https://malik.test/api/youtube/callback?error=access_denied&state=${state}`, { headers: { cookie: `malik_youtube_state=${state}` } }); const r = await callback(req()); assert.equal(new URL(r.headers.get("location")).searchParams.get("view"), "following"); assert.equal(new URL(r.headers.get("location")).searchParams.get("youtube"), "consent_denied"); assert.equal((await callback(req())).status, 403) })
test("Body size is bounded before writes", async () => { const r = await run(`videos/${videoId}/comments`, "POST", { text: "x".repeat(18000) }); assert.equal(r.status, 413); assert.ok(!requests.some(({url}) => url.hostname === "www.googleapis.com")) })
test("No undocumented comment-rating route", async () => { assert.equal((await run("comments/comment-test/rate", "POST", { rating: "like" })).status, 404) })
test("Unlike uses none and confirms viewer state", async () => { rating = "like"; const r = await run(`videos/${videoId}/rating`, "POST", { rating: "none" }); assert.equal((await r.json()).video.rating, "none") })
test("Disabled comments preserve a meaningful error", async () => { responder = (url) => url.pathname.endsWith("commentThreads") ? reply({ error: { errors: [{ reason: "commentsDisabled" }] } }, 403) : null; const r = await run(`videos/${videoId}/comments`, "POST", { text: "test" }); assert.equal(r.status, 403); assert.equal((await r.json()).error, "commentsDisabled") })
test("Replies use official parentId and returned resource", async () => { responder = (url, init) => url.pathname.endsWith("comments") && init.method === "POST" ? reply({ id: "reply-test", snippet: { parentId: "top-test", textOriginal: "test reply", authorChannelId: { value: channelId } } }) : null; const r = await run("comments/top-test/replies", "POST", { text: "test reply" }); assert.equal((await r.json()).item.parentId, "top-test"); const call = requests.find(({url,init}) => url.pathname.endsWith("comments") && init.method === "POST"); assert.equal(JSON.parse(call.init.body).snippet.parentId, "top-test") })
test("Own comment deletion goes to YouTube", async () => { responder = (url, init) => url.pathname.endsWith("comments") ? init.method === "DELETE" ? reply(null, 204) : reply({ items: [{ id: "own-test", snippet: { authorChannelId: { value: channelId } } }] }) : null; assert.equal((await run("comments/own-test", "DELETE", {})).status, 200); assert.ok(requests.some(({url,init}) => url.pathname.endsWith("comments") && init.method === "DELETE")) })
test("Unsubscribe resolves subscription ID before deletion", async () => { let active = true; responder = (url, init) => { if (!url.pathname.endsWith("subscriptions")) return null; if (init.method === "DELETE") { assert.equal(url.searchParams.get("id"), "subscription-test"); active = false; return reply(null, 204) } return reply({ items: active ? [{ id: "subscription-test" }] : [] }) }; const r = await run(`channels/${channelId}/subscription`, "POST", { subscribed: false }); assert.equal((await r.json()).subscribed, false) })
test("Multiple channel identities cannot silently authorize a guessed author", async () => { responder = (url) => url.pathname.endsWith("channels") ? reply({ items: [channel, { ...channel, id: "UC" + "b".repeat(22) }] }) : null; const r = await run("me", "POST", { channelId }); assert.equal(r.status, 409); assert.equal((await r.json()).error, "CHANNEL_SELECTION_REQUIRED") })
test("OAuth success stores encrypted tokens and restores deep link", async () => { const state = nonce(); const r = await callback(new NextRequest(`https://malik.test/api/youtube/callback?code=test&state=${state}`, { headers: { cookie: `malik_youtube_state=${state}` } })); assert.equal(r.status, 307); assert.equal(new URL(r.headers.get("location")).pathname, "/shorts"); assert.equal(unseal(row.refresh_encrypted, user), "new-refresh"); assert.ok(!row.refresh_encrypted.includes("new-refresh")); assert.equal(row.channel_id, channelId) })
