import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { spawn } from "node:child_process"
import { workTestLoader } from "./work-test-loader.mjs"

// The model boundary is a fixed, reviewed fixture. This runner is test-only:
// it is NOT an API for arbitrary user/LLM code and is never imported by Next.
const load = workTestLoader({"@/lib/server/malik-model-router":{runStrictMalikModel:()=>{throw new Error("unexpected model call")}}})
const { buildSelfProject, parseSelfBuild }=load("lib/selfbuild/studio.ts")
const { selfBuildIntent }=load("lib/selfbuild/intent.ts")
const { sourceHash }=load("lib/website/engine/workspace.ts")
const { projectArtifactFiles }=load("lib/server/project-artifact-store.ts")
const { executeNodeTests }=load("lib/selfbuild/executor.ts")
const source = good => [
  {path:"PLAN.json",content:JSON.stringify({title:"Slug CLI",requirements:["CLI slug utility with tests"],steps:["Implement slug","Test boundaries"]})},
  {path:"package.json",content:'{"name":"slug-cli","type":"module","scripts":{"test":"node --test"}}'},
  {path:"slug.mjs",content:good ? 'export const slug = value => value.trim().toLowerCase().replace(/\\s+/g,"-")' : 'export const slug = value => value'},
  {path:"cli.mjs",content:'import {slug} from "./slug.mjs"; console.log(slug(process.argv.slice(2).join(" ")));'},
  {path:"slug.test.mjs",content:'import test from "node:test"; import assert from "node:assert/strict"; import {slug} from "./slug.mjs"; test("case and spaces",()=>assert.equal(slug(" Hello World "),"hello-world")); test("empty",()=>assert.equal(slug(""),""));'},
  {path:"README.md",content:"node cli.mjs Hello World\nnode --test"},
]
const blocks=files=>files.map(file=>`<<<FILE:${file.path}>>>\n${file.content}\n<<<END_FILE>>>`).join("\n")
let executions=0
async function reviewedFixtureRunner(files) {
  // Refuse anything outside these exact reviewed fixture candidates.
  assert.ok([sourceHash(source(true)),sourceHash(source(false))].includes(sourceHash(files)))
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),"malik-selfbuild-reviewed-fixture-"))
  try {
    for(const file of files) await fs.writeFile(path.join(directory,file.path),file.content)
    const began=performance.now()
    const result=await new Promise((resolve,reject)=>{
      const child=spawn(process.execPath,["--permission",`--allow-fs-read=${directory}`,"--disallow-code-generation-from-strings","--max-old-space-size=96","--test","--experimental-test-isolation=none","--test-reporter=tap","slug.test.mjs"],{cwd:directory,env:{},windowsHide:true,stdio:["ignore","pipe","pipe"]})
      let output="";const timeout=setTimeout(()=>{child.kill("SIGKILL");reject(new Error("timeout"))},10000)
      child.stdout.on("data",chunk=>{output+=chunk;if(output.length>32000)child.kill("SIGKILL")})
      child.stderr.on("data",()=>{})
      child.once("error",error=>{clearTimeout(timeout);reject(error)})
      child.once("close",code=>{clearTimeout(timeout);resolve({code,output})})
    })
    executions++
    const tests=Number(result.output.match(/# tests (\d+)/)?.[1]||0), failures=Number(result.output.match(/# fail (\d+)/)?.[1]||0)
    assert.ok(tests>0,result.output)
    return {sourceHash:sourceHash(files),status:result.code===0&&failures===0?"pass":"fail",command:"node --test --test-reporter=tap",tests,failures,durationMs:performance.now()-began,details:[result.output.slice(-1600)]}
  } finally {
    assert.ok(path.resolve(directory).startsWith(path.resolve(os.tmpdir())+path.sep+"malik-selfbuild-reviewed-fixture-"))
    await fs.rm(directory,{recursive:true,force:true})
  }
}

test("CLI intent leaves questions, other languages and ordinary chat alone",()=>{
  for(const prompt of ["сделай CLI-утилиту с тестами","Build a CLI in Node.js with tests","Напиши консольную утилиту с тестами"]) assert.equal(selfBuildIntent(prompt),true,prompt)
  for(const prompt of ["объясни что такое CLI","Напиши стих","Сделай сайт магазина","Напиши CLI на Python с тестами","do not build a CLI with tests","Что такое build CLI with tests?","Напиши инструкцию для CLI на Node.js с тестами","don't build a CLI with tests"]) assert.equal(selfBuildIntent(prompt),false,prompt)
})
test("file markers are mandatory; paths, secrets, fake passport and partial responses are refused",()=>{
  const good=blocks(source(true)); assert.equal(parseSelfBuild(good).files.length,6)
  for(const bad of [good.replace("<<<END_FILE>>>",""),good.replace("slug.mjs>>>","../slug.mjs>>>"),good.replace("README.md>>>","PROOF_PASSPORT.json>>>"),good.replace("README.md>>>",".env>>>")]) assert.throws(()=>parseSelfBuild(bad))
})
test("requirements -> generated CLI -> actual node --test failure -> bounded repair -> PASS passport -> ZIP receipt",async()=>{
  let calls=0;executions=0
  const result=await buildSelfProject({prompt:"Build a CLI slug utility with tests"},{model:async input=>{assert.match(input.systemPrompt,/node:test/);calls++;if(calls>1)assert.match(input.prompt,/CHECK FINDINGS/);return blocks(source(calls>1))},runner:reviewedFixtureRunner})
  assert.equal(result.status,"completed",result.error)
  assert.equal(calls,2);assert.equal(executions,2)
  assert.equal(result.passport.status,"PASS")
  assert.match(result.passport.commands.join("\n"),/node --test/)
  assert.equal(JSON.parse(projectArtifactFiles(result).at(-1).content).status,"PASS")
  result.files.find(file=>file.path==="slug.mjs").content+="\n// changed"
  assert.notEqual(JSON.parse(projectArtifactFiles(result).at(-1).content).status,"PASS","stale runtime evidence cannot bless edited code")
})
test("non-improving real failure stops after one repair and never exports PASS",async()=>{
  let calls=0
  const result=await buildSelfProject({prompt:"Build CLI tests"},{model:async()=>{calls++;return blocks(source(false))},runner:reviewedFixtureRunner})
  assert.equal(calls,2);assert.equal(result.passport.status,"FAIL");assert.equal(result.status,"failed")
})
test("no executor means downloadable source and PARTIAL, not a fake runtime pass or wasteful repair",async()=>{
  const saved=[process.env.WEBSITE_EXECUTOR_URL,process.env.WEBSITE_EXECUTOR_TOKEN]
  delete process.env.WEBSITE_EXECUTOR_URL;delete process.env.WEBSITE_EXECUTOR_TOKEN
  try {
    let calls=0
    const result=await buildSelfProject({prompt:"Build CLI tests"},{model:async()=>{calls++;return blocks(source(true))}})
    assert.equal(calls,1);assert.equal(result.status,"completed");assert.equal(result.passport.status,"PARTIAL")
    assert.equal(result.passport.checks.find(check=>check.id==="unit").status,"not_run")
    assert.ok(!result.passport.commands.some(command=>command.includes("node --test")))
  } finally {for(const [index,name] of ["WEBSITE_EXECUTOR_URL","WEBSITE_EXECUTOR_TOKEN"].entries()){if(saved[index]===undefined)delete process.env[name];else process.env[name]=saved[index]}}
})
test("executor receipts are bounded, code-bound and cannot claim empty/pending/unisolated tests passed",async()=>{
  const originalFetch=globalThis.fetch, saved=[process.env.WEBSITE_EXECUTOR_URL,process.env.WEBSITE_EXECUTOR_TOKEN]
  process.env.WEBSITE_EXECUTOR_URL="https://executor.example";process.env.WEBSITE_EXECUTOR_TOKEN="fixture-".repeat(8)
  const base={protocol:"malik-node-test/1",sourceHash:sourceHash(source(true)),status:"completed",isolation:"microvm",network:"deny-all",command:"node --test --test-reporter=tap",exitCode:0,tests:2,failures:0,durationMs:20,details:["fixture"]}
  try {
    for(const patch of [{},{tests:0},{sourceHash:"0".repeat(64)},{status:"running"},{isolation:"process"},{network:"allow-all"},{skipped:1},{failures:1},{exitCode:1}]){
      globalThis.fetch=async(_url,opts)=>{const request=JSON.parse(opts.body);assert.equal(request.policy.secrets,false);assert.deepEqual(request.policy.network,[]);return Response.json({...base,...patch})}
      const receipt=await executeNodeTests(source(true))
      assert.equal(receipt.status,Object.keys(patch).length===0?"pass":("skipped"in patch||"failures"in patch||"exitCode"in patch)?"fail":"not_run")
    }
    globalThis.fetch=async()=>new Response("x".repeat(41000))
    assert.equal((await executeNodeTests(source(true))).status,"not_run")
  } finally {globalThis.fetch=originalFetch;for(const [index,name] of ["WEBSITE_EXECUTOR_URL","WEBSITE_EXECUTOR_TOKEN"].entries()){if(saved[index]===undefined)delete process.env[name];else process.env[name]=saved[index]}}
})
test("pre-cancelled Self-Build never calls the model or executor",async()=>{
  const controller=new AbortController();controller.abort()
  await assert.rejects(()=>buildSelfProject({prompt:"CLI",signal:controller.signal},{model:()=>{throw new Error("must not call")}}),{name:"AbortError"})
})
