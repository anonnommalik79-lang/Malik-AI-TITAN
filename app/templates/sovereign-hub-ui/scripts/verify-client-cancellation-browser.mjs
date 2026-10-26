// Real Chromium -> actual client helpers -> local HTTP -> aborted body.
// This is a controlled regression server, not production/provider acceptance.
import assert from "node:assert/strict"
import fs from "node:fs/promises"
import http from "node:http"
import path from "node:path"
import { createRequire } from "node:module"
import { reactQaBundle, reactQaRuntime } from "./qa-react-bundle.mjs"
const require = createRequire(import.meta.url)
const { chromium } = require(process.env.MALIK_QA_PLAYWRIGHT_PATH || "playwright")
const { modules, bundle } = reactQaBundle()
const api = bundle("lib/api-client.ts"), os = bundle("components/sovereign/os/os-client.ts")
let requests = 0, interrupted = 0
const server = http.createServer((req, res) => {
  if (req.url?.startsWith("/slow")) {
    requests++
    res.writeHead(200, { "content-type": "application/json" }); res.write('{"ok":')
    const timer = setTimeout(() => res.end("true}"), 30000)
    res.on("close", () => { clearTimeout(timer); if (!res.writableEnded) interrupted++ })
    return
  }
  res.setHeader("content-type", "text/html; charset=utf-8")
  res.end(`<!doctype html><html lang="ru"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{background:#080808;color:#eee;font:16px/1.6 system-ui;margin:24px}main{max-width:720px;margin:auto}section{border:1px solid #555;padding:16px;margin:16px 0}button{padding:12px;margin:5px}output{display:block;overflow-wrap:anywhere}</style><main><h1>Проверка отмены Malik AI</h1><p>Локальный стенд: настоящие клиентские модули и HTTP. Не production и не вызов модели.</p>${["api","os"].map(id=>`<section><h2>${id}Fetch</h2><button id="${id}-start">Начать ${id}</button><button id="${id}-stop">Отменить ${id}</button><button id="${id}-pre">Отменён заранее ${id}</button><output id="${id}-state">idle</output></section>`).join("")}</main><script>${reactQaRuntime(modules)}
const fns={api:require(${JSON.stringify(api)}).apiFetch,os:require(${JSON.stringify(os)}).osFetch},controllers={};
for(const id of ['api','os']){
 const output=document.getElementById(id+'-state');
 const start=async(pre)=>{const c=new AbortController();controllers[id]=c;if(pre)c.abort();output.textContent='pending';const result=await fns[id]('/slow?'+id,{signal:c.signal});output.textContent=JSON.stringify(result);output.dataset.done='true';};
 document.getElementById(id+'-start').onclick=()=>start(false);
 document.getElementById(id+'-pre').onclick=()=>start(true);
 document.getElementById(id+'-stop').onclick=()=>controllers[id]?.abort();
}</script></html>`)
})
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve))
const origin = `http://127.0.0.1:${server.address().port}`
const browser = await chromium.launch({headless:true,executablePath:process.env.MALIK_QA_CHROMIUM_EXECUTABLE})
const output = path.resolve(process.env.MALIK_AUDIT_OUTPUT || ".data/client-cancel-browser")
await fs.mkdir(output,{recursive:true})
try {
 for(const width of [375,1440]){
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  await page.goto(origin)
  for(const id of ['api','os']){
   const sent=page.waitForResponse(r=>r.url().includes('/slow?'+id))
   await page.locator('#'+id+'-start').click();await sent
   await page.screenshot({path:path.join(output,`cancel-${width}-${id}-before.png`)})
   await page.locator('#'+id+'-stop').click()
   await page.locator('#'+id+'-state[data-done=true]').waitFor()
   const result=JSON.parse(await page.locator('#'+id+'-state').innerText())
   assert.equal(result.ok,false);assert.equal(result.status,0)
   assert.match(result.error||result.message,/отменён/)
   const before=requests
   await page.locator('#'+id+'-pre').click()
   await page.waitForFunction(id=>document.getElementById(id+'-state').textContent!=='pending',id)
   assert.equal(requests,before,'already cancelled requests must not reach HTTP')
   await page.screenshot({path:path.join(output,`cancel-${width}-${id}-after.png`)})
  }
  assert.deepEqual(errors,[])
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
  await page.close()
  console.log(`PASS real browser cancellation / body abort / pre-abort / console / overflow: ${width}px`)
 }
 assert.equal(requests,4);assert.equal(interrupted,4)
} finally { await browser.close();await new Promise(resolve=>server.close(resolve)) }
