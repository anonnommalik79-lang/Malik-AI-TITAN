import test from "node:test"
import assert from "node:assert/strict"
import { workTestLoader } from "./work-test-loader.mjs"

let review = "PASS", modelCalls = 0
const source = [
  ["app/page.tsx", 'export default function Page() { return <main><h1>Calculator</h1></main> }'],
  ["app/layout.tsx", 'import "./globals.css"\nexport default function Layout({children}: {children: React.ReactNode}) { return <html lang="en"><body>{children}</body></html> }'],
  ["app/globals.css", 'body{margin:0;color:#111;background:#fff;font-family:Arial}main{max-width:70rem;padding:2rem;margin:auto}h1{font-size:clamp(2rem,5vw,5rem)}button{border:0;border-radius:.5rem;padding:1rem}a{color:inherit}input{padding:1rem}section{display:grid;gap:1rem}@media(max-width:600px){main{padding:1rem}}:focus-visible{outline:2px solid blue}p{line-height:1.6}'],
  ["README.md", '# Calculator\n\nnpm install\nnpm run dev\nnpm run build\n\n' + 'Source only. Run the build locally before deployment. This example has a responsive main page and uses no external APIs or credentials. '.repeat(3)],
]
const blocks = source.map(([path, code]) => `<<<FILE:${path}>>>\n${code}\n<<<END_FILE>>>`).join("\n")
const storage = new Map()
const load = workTestLoader({
  "@/lib/server/malik-model-router": { runStrictMalikModel: async input => {
    modelCalls++
    if (/Project QA/.test(input.systemPrompt)) { if (review === null) throw new Error("unavailable"); return {content:review} }
    return {content:blocks,provider:"fixture",model:"fixture"}
  } },
  "@/lib/server/private-json-store": { writePrivateJson: async (key,value) => storage.set(key,value), readPrivateJson: async key => storage.get(key), deletePrivateJson: async key => storage.delete(key) },
})
const { generateProjectWithBrain } = load("lib/ai/project-builder.ts")
const { projectArtifactFiles, putProjectArtifact, getProjectArtifact } = load("lib/server/project-artifact-store.ts")
const { forgeSite } = load("lib/sites/forge/index.ts")
const { forgeChatMessage } = load("lib/sites/forge/chat.ts")
const { preparePublishedSite } = load("lib/sites/forge/publish.ts")
const { readPassport, buildPassport } = load("lib/proof/passport.ts")
const { buildProjectZip } = load("lib/business/project-zip.ts")
const { readProjectZip } = load("lib/work/code/zip-read.ts")

test("project generation -> static QA -> model review -> ZIP: no invented build PASS", async () => {
  review = "PASS"
  const project = await generateProjectWithBrain({prompt:"Build a calculator"})
  assert.equal(project.status,"completed")
  assert.equal(project.qa.reviewStatus,"pass")
  assert.equal(project.passport.status,"PARTIAL")
  for (const id of ["build","unit","browser"]) assert.equal(project.passport.checks.find(c=>c.id===id).status,"not_run")
  const artifact = await putProjectArtifact(project,"owner-a")
  assert.equal(await getProjectArtifact(artifact.id,"owner-b"),null)
  const entries = projectArtifactFiles({...project,files:[...project.files,{path:"PROOF_PASSPORT.json",content:'{"status":"PASS"}'}]})
  const zipped = buildProjectZip(entries)
  const unpacked = readProjectZip(Buffer.from(await zipped.arrayBuffer()))
  const passports = unpacked.files.filter(file=>file.path==="PROOF_PASSPORT.json")
  assert.equal(passports.length,1)
  const p = readPassport(passports[0].content)
  assert.equal(p.status,"PARTIAL")
  assert.equal(p.artifacts[0].sha256.length,64)
})

test("unavailable model review is NOT_TESTED, never PASS and never repair-looped", async () => {
  review = null; modelCalls = 0
  const project = await generateProjectWithBrain({prompt:"Build a calculator"})
  assert.equal(project.status,"completed",project.error)
  assert.equal(project.qa.reviewStatus,"not_run")
  assert.equal(project.passport.checks.find(c=>c.id==="review").status,"not_run")
  assert.equal(project.passport.status,"PARTIAL")
  assert.equal(modelCalls,2,"one generation and one unavailable review, no wasteful repair")
})

test("rejected model review stays FAIL with bounded repair", async () => {
  review = "FIX: calculator lacks an input"; modelCalls = 0
  const project = await generateProjectWithBrain({prompt:"Build a calculator"})
  assert.equal(project.status,"failed")
  assert.equal(project.passport.status,"FAIL")
  assert.equal(project.passport.checks.find(c=>c.id==="static").status,"pass")
  assert.ok(modelCalls<=6)
  await assert.rejects(()=>putProjectArtifact(project,"owner"))
})

test("site generation -> HTML -> chat -> publish: static evidence survives but browser never fabricated", async () => {
  const site = await forgeSite({prompt:"Сделай сайт кофейни"})
  assert.equal(site.quality.ok,true)
  assert.equal(site.passport.status,"PARTIAL")
  assert.match(site.html,/id="malik-proof-passport"/)
  assert.match(forgeChatMessage(site,"new"),/Паспорт проверок.*PARTIAL/)
  const published = preparePublishedSite(site.html)
  assert.equal(published.ok,true)
  assert.match(published.html,/id="malik-proof-passport"/)
  const p=readPassport(JSON.parse(published.html.match(/id="malik-proof-passport" type="application\/json">([\s\S]*?)<\/script>/)[1]))
  assert.equal(p.checks.find(c=>c.id==="browser").status,"not_run")
})

test("malformed stored checks cannot manufacture a PASS or crash restoration", () => {
  const p=buildPassport({projectId:"p",kind:"project",title:"p",checks:[]})
  for (const checks of [[null],[{}],[{status:"PASS"}],[{status:"pass",required:false}]]) assert.equal(readPassport({...p,checks,status:"PASS"}),null)
  assert.equal(readPassport({...p,status:"PASS",commands:["fake"]}).status,"NOT_TESTED")
})
