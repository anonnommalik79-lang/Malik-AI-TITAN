// Actual Markdown renderer + actual engine evidence in a component harness.
// No app session, live provider, production account or real-device claim.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import {createRequire} from 'node:module'
import {workTestLoader} from './work-test-loader.mjs'
const require=createRequire(import.meta.url),qaRequire=process.env.MALIK_QA_DEPS?createRequire(path.join(process.env.MALIK_QA_DEPS,'fixture.cjs')):require
const {webpack}=qaRequire('next/dist/compiled/webpack/webpack'),{chromium}=require(process.env.MALIK_QA_PLAYWRIGHT_PATH||'playwright')
const output=fs.mkdtempSync(path.join(os.tmpdir(),'malik-model-review-browser-'))
const compiler=webpack({mode:'development',target:'web',devtool:false,context:process.cwd(),entry:path.resolve('scripts/qa-oil-science-client.mjs'),output:{path:output,filename:'client.js',publicPath:'/'},resolve:{fullySpecified:false,extensions:['.ts','.tsx','.mjs','.js','.json'],alias:{'@':process.cwd()},modules:[path.join(process.env.MALIK_QA_DEPS||process.cwd(),'node_modules'),'node_modules']},module:{rules:[{test:/\.tsx?$/,exclude:/node_modules/,use:path.resolve('scripts/qa-typescript-loader.cjs')},{test:/\.m?js$/,resolve:{fullySpecified:false}},{test:/\.css$/,type:'asset/source'}]},optimization:{minimize:false,splitChunks:false},performance:{hints:false}})
await new Promise((resolve,reject)=>compiler.run((error,stats)=>{compiler.close(()=>{});if(error||stats.hasErrors())reject(error||new Error(stats.toString({all:false,errors:true})));else resolve()}))
const load=workTestLoader(),{runPetroleum}=load('lib/work/petroleum/engine.ts'),{petroleumReport}=load('lib/work/petroleum/report.ts'),review=load('lib/work/petroleum/model-review.ts')
const receipt=runPetroleum({op:'npv',cashflows:[-100,60,60],rate:.1,period:'year',currency:'USD'}),evidence=review.receiptReviewEvidence(receipt)
const sentence={ru:'Интерпретация касается только заданных денежных потоков; исходные допущения необходимо независимо проверить.',en:'This interpretation concerns only the supplied cash flows; input assumptions require independent review.',kk:'Талдау тек берілген ақша ағындарына қатысты; бастапқы болжамдарды тәуелсіз тексеру қажет.',ar:'يتعلق هذا التفسير بالتدفقات النقدية المقدمة فقط؛ وتحتاج الافتراضات إلى مراجعة مستقلة.'}
const css=['app/chat-black-surface-final.css','components/sovereign/malik-tex.css','components/sovereign/answer-blocks.css','components/sovereign/visual-engine/visual-engine.css','components/sovereign/oil-report.css'].map(file=>fs.readFileSync(file,'utf8')).join('\n')
const server=http.createServer((request,response)=>{
 const url=new URL(request.url,'http://local')
 if(/^\/[\w.-]+\.js$/.test(url.pathname)){const file=path.join(output,path.basename(url.pathname));if(!fs.existsSync(file)){response.writeHead(404);response.end();return}response.setHeader('content-type','application/javascript');fs.createReadStream(file).pipe(response);return}
 const language=url.searchParams.get('lang')||'ru'
 if(!Object.hasOwn(sentence,language)){response.writeHead(400);response.end();return}
 const text=sentence[language],accepted=review.parseOilModelReview(JSON.stringify({conclusion:text,findings:[{kind:'interpretation',factIds:['F0'],text}],assumptions:[text],missingData:[text],nextChecks:[text],limitations:[text]}),evidence)
 const report=petroleumReport(receipt,language)+'\n\n'+review.renderOilModelReview(accepted,evidence,language)+'\n\n'+review.oilReviewParticipation(language,'MalikLLM MAX',1,true)
 response.setHeader('content-type','text/html;charset=utf-8');response.end(`<!doctype html><html lang="${language}" dir="${language==='ar'?'rtl':'ltr'}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;background:#000;color:#eee;font:16px system-ui}#root{width:calc(100% - 32px);max-width:900px;min-width:0;margin:20px auto 160px}pre{max-width:100%;overflow:auto}${css}</style><main id="root"></main><script id="qa-report" type="application/json">${JSON.stringify(report).replace(/</g,'\\u003c')}</script><script src="/client.js"></script></html>`)
})
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
const browser=await chromium.launch({headless:true,executablePath:process.env.MALIK_QA_CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage']})
try{for(const width of [390,1280])for(const language of ['ru','en','kk','ar']){
 const context=await browser.newContext({viewport:{width,height:844},isMobile:width===390,hasTouch:width===390}),page=await context.newPage(),errors=[]
 page.on('pageerror',error=>errors.push(String(error)))
 await page.goto(`http://127.0.0.1:${server.address().port}/?lang=${language}`)
 await page.locator('.malik-md-table').first().waitFor({timeout:30000})
 const text=await page.locator('#root').innerText();assert.ok(text.includes(sentence[language]));assert.ok(text.includes(evidence.hash));assert.match(text,/4[.,]132231404958667/);assert.match(text,/USD/)
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,`overflow ${width}/${language}`)
 assert.equal(await page.locator('html').getAttribute('dir'),language==='ar'?'rtl':'ltr')
 assert.equal(await page.locator('#root img').count(),0)
 assert.equal(errors.length,0,errors.join('\n'))
 console.log(`PASS combined calculation/model-review Markdown ${width}px/${language}: exact references, readable sections, no page overflow; component fixture, not authenticated/live inference`)
 await context.close()
}}finally{await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
