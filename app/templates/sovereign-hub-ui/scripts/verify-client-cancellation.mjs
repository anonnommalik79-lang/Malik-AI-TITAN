import assert from "node:assert/strict"
import test from "node:test"
import { workTestLoader } from "./work-test-loader.mjs"
const load = workTestLoader()
const { apiFetch } = load("lib/api-client.ts")
const { osFetch } = load("components/sovereign/os/os-client.ts")
globalThis.window = { setTimeout, clearTimeout }
const originalFetch = globalThis.fetch
function track(signal) {
  let added = 0, removed = 0
  const add = signal.addEventListener.bind(signal), remove = signal.removeEventListener.bind(signal)
  signal.addEventListener = (...args) => { if (args[0] === "abort") added++; return add(...args) }
  signal.removeEventListener = (...args) => { if (args[0] === "abort") removed++; return remove(...args) }
  return () => ({ added, removed })
}
for (const [name, request] of [["apiFetch", apiFetch], ["osFetch", osFetch]]) {
  test(`${name}: an already-cancelled parent never starts work`, async () => {
    let calls = 0
    const controller = new AbortController(); controller.abort()
    globalThis.fetch = async () => { calls++; return Response.json({ok:true}) }
    try {
      const result = await request("/audit-only", {signal:controller.signal})
      assert.equal(result.ok, false)
      assert.equal(calls, 0)
    } finally { globalThis.fetch = originalFetch }
  })
  test(`${name}: parent abort reaches the actual in-flight fetch`, async () => {
    const controller = new AbortController()
    const listeners = track(controller.signal)
    let active
    globalThis.fetch = async (_, init) => {
      active = init.signal
      controller.abort()
      if (active.aborted) throw new DOMException("Cancelled", "AbortError")
      return Response.json({ok:true})
    }
    try {
      const result = await request("/audit-only", {signal:controller.signal})
      assert.equal(active.aborted, true)
      assert.equal(result.ok, false)
      assert.equal(listeners().added, listeners().removed)
    } finally { globalThis.fetch = originalFetch }
  })
  test(`${name}: cancellation while JSON body is being read is not an HTTP-200 failure`, async () => {
    const controller = new AbortController()
    globalThis.fetch = async () => ({ok:true,status:200,headers:new Headers({'content-type':'application/json'}),json:async()=>{controller.abort();throw new DOMException('Cancelled','AbortError')}})
    try {
      const result=await request('/audit-only',{signal:controller.signal})
      assert.equal(result.ok,false)
      assert.equal(result.status,0)
      assert.match(result.error||result.message,/отменён/)
    } finally {globalThis.fetch=originalFetch}
  })
  test(`${name}: its own deadline also bounds a stalled JSON body`, {timeout:1500}, async () => {
    globalThis.fetch=async(_,init)=>({ok:true,status:200,headers:new Headers({'content-type':'application/json'}),json:()=>new Promise((_,reject)=>{init.signal.addEventListener('abort',()=>reject(new DOMException('Timed out','AbortError')),{once:true})})})
    try {
      const result=name==='apiFetch'?await request('/audit-only',{},5):await request('/audit-only',{timeoutMs:5})
      assert.equal(result.ok,false);assert.equal(result.status,0)
    } finally {globalThis.fetch=originalFetch}
  })
  for (const status of [200, 401, 403, 429, 500]) test(`${name}: HTTP ${status} settles and removes its abort listener`, async () => {
    const controller = new AbortController(), listeners = track(controller.signal)
    globalThis.fetch = async () => Response.json(status === 200 ? {ok:true} : {ok:false,error:"Audit test rejection"}, {status})
    try {
      const result = await request("/audit-only", {signal:controller.signal})
      assert.equal(result.ok, status === 200)
      if (name === "apiFetch" || status !== 200) assert.equal(result.status, status)
      else assert.equal(result.data.ok, true) // OS success is {ok, data}, not {ok, status, data}.
      assert.equal(listeners().added, listeners().removed)
    } finally { globalThis.fetch = originalFetch }
  })
  test(`${name}: transport error is not a successful result and removes listeners`, async () => {
    const controller = new AbortController(), listeners = track(controller.signal)
    globalThis.fetch = async () => { throw new TypeError("Failed to fetch") }
    try {
      const result = await request("/audit-only", {signal:controller.signal})
      assert.equal(result.ok, false)
      assert.equal(result.status, 0)
      assert.equal(listeners().added, listeners().removed)
    } finally { globalThis.fetch = originalFetch }
  })
}
