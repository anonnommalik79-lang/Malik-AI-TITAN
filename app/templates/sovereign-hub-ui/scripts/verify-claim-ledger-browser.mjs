// Actual new React disclosure content, production CSS, fixture evidence only.
// This does not claim authenticated production/model acceptance.
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import http from "node:http"
import {createRequire} from "node:module"
import {reactQaBundle,reactQaRuntime} from "./qa-react-bundle.mjs"
import {workTestLoader} from "./work-test-loader.mjs"
const require=createRequire(import.meta.url)
const playwright=require(process.env.MALIK_QA_PLAYWRIGHT_PATH || "playwright")
const {buildClaimLedger,normalizeClaimLedger}=workTestLoader({})("lib/ai/claim-ledger.ts")
const ledger=buildClaimLedger({answer:"17 * 23 = 391\nThe published sample contains 1200 measurements. [1]\nПрогноз: выручка 1500 USD.",prompt:"Calculate and summarize",sources:[{url:"https://source.example/report",snippet:"The published sample contains 1200 measurements.",readAt:"2026-10-24T10:00:00Z"}]})
ledger.claims.push({id:"escape",text:'<img src=x onerror="window.injected=true">',origin:"external-fact",status:"UNVERIFIED",evidence:[{method:"none",url:"javascript:window.injected=true"}]})
const normalized=normalizeClaimLedger(ledger)
const {modules,bundle}=reactQaBundle(),entry=bundle("components/sovereign/ClaimLedgerPanel.tsx")
const css=[]
function walk(directory){if(!fs.existsSync(directory))return;for(const file of fs.readdirSync(directory,{withFileTypes:true})){const full=path.join(directory,file.name);if(file.isDirectory())walk(full);else if(file.name.endsWith(".css"))css.push(fs.readFileSync(full,"utf8"))}}
walk(".next/static")
assert.ok(css.length,"Run the production build first; this test uses the actual compiled CSS")
const boot=`${reactQaRuntime(modules)}require('react-dom/client').createRoot(document.getElementById('root')).render(React.createElement(require(${JSON.stringify(entry)}).ClaimLedgerPanel,{ledger:${JSON.stringify(normalized)}}));`.replace(/<\/script/gi,"<\\/script")
const server=http.createServer((_,res)=>{res.setHeader("content-type","text/html;charset=utf-8");res.end(`<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css.join("\n")}body{background:#000;color:#eee;font-family:Arial}main{max-width:680px;margin:24px auto;padding:16px;min-width:0}</style><main><p>QA компонента · тестовые доказательства, не production</p><section class="malik-fact-audit"><div id="root"></div></section></main><script>${boot}</script></html>`)})
// Avoid OS-allocated ports such as 5060, which Chromium blocks as unsafe.
await new Promise((resolve,reject)=>server.once("error",reject).listen(20000+Math.floor(Math.random()*20000),"127.0.0.1",resolve))
const browser=await playwright.chromium.launch({headless:true,...(process.env.MALIK_QA_CHROMIUM_EXECUTABLE?{executablePath:process.env.MALIK_QA_CHROMIUM_EXECUTABLE}:{})})
try{
  for(const width of[375,1440]){
    const page=await browser.newPage({viewport:{width,height:900}}),errors=[]
    page.on("pageerror",error=>errors.push(error.message))
    await page.goto(`http://127.0.0.1:${server.address().port}`)
    const panel=page.locator("[data-malik-claim-ledger]")
    await panel.waitFor()
    assert.match(await panel.innerText(),/VERIFIED.*calculation/s)
    assert.match(await panel.innerText(),/UNCERTAIN.*forecast/s)
    assert.match(await panel.innerText(),/не истинность/)
    assert.equal(await panel.locator('a[href^="javascript:"]').count(),0)
    assert.equal(await panel.locator("img").count(),0)
    assert.equal(await page.evaluate(()=>!!window.injected),false)
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false)
    assert.deepEqual(errors,[])
    if(process.env.MALIK_QA_OUTPUT){fs.mkdirSync(process.env.MALIK_QA_OUTPUT,{recursive:true});await page.screenshot({path:path.join(process.env.MALIK_QA_OUTPUT,`claim-ledger-${width}.png`),fullPage:true})}
    console.log(`PASS ${width}px: actual ClaimLedgerPanel, production CSS, evidence labels, escaped content, no overflow`)
    await page.close()
  }
}finally{await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
