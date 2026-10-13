import assert from "node:assert/strict"
import { requestedEiaSpotSeries, parseEiaSpotResponse, fetchEiaSpotEvidence } from "../lib/server/petroleum-eia.ts"
import { PETROLEUM_OPEN_RESOURCES, selectPetroleumResources } from "../lib/work/petroleum/open-science.ts"

assert.deepEqual(requestedEiaSpotSeries("Какая текущая цена нефти Brent и WTI?"), ["RBRTE","RWTC"])
assert.deepEqual(requestedEiaSpotSeries("What is the latest WTI spot price?"),["RWTC"])
assert.deepEqual(requestedEiaSpotSeries("UAE 150 well PINN 8x H100 92% water cut"),[])
assert.deepEqual(requestedEiaSpotSeries("NPV при сценарной цене Brent $50/$95/bbl"),[])
assert.deepEqual(requestedEiaSpotSeries("Price of Brent, assumption $50 for scenario"),[])
assert.deepEqual(selectPetroleumResources("Как исполнять PorePy для трещиноватых резервуаров?").map(x=>x.id).slice(0,2),["porepy","opm-flow"])
assert.ok(PETROLEUM_OPEN_RESOURCES.find(s=>s.id==="opm-flow").license.includes("GPL"))
assert.ok(PETROLEUM_OPEN_RESOURCES.find(s=>s.id==="volve").caveat.includes("downloaded"))

const mk=(series,value,units="$/BBL",period="2026-10-12")=>({response:{data:[{series,value,units,period}]}})
assert.deepEqual(parseEiaSpotResponse(mk("RBRTE","72.35"),"RBRTE"),{series:"RBRTE",period:"2026-10-12",value:72.35,units:"$/BBL"})
assert.throws(()=>parseEiaSpotResponse(mk("RWTC",72.3),"RBRTE"),/series absent/)
assert.throws(()=>parseEiaSpotResponse(mk("RBRTE","NaN"),"RBRTE"),/invalid spot/)
assert.throws(()=>parseEiaSpotResponse(mk("RBRTE",76,"$/GAL"),"RBRTE"),/incompatible/)
assert.throws(()=>parseEiaSpotResponse(mk("RBRTE",76,"$/BBL","2026-02-30"),"RBRTE"),/invalid period/)
const noKey=await fetchEiaSpotEvidence("Актуальная цена нефти Brent",{key:"",fetcher:()=>{throw Error("Must not call")} })
assert.equal(noKey.status,"not-configured")
assert.equal(noKey.context,"")
const unrelated=await fetchEiaSpotEvidence("Обводнённость скважины",{key:"TEST",fetcher:()=>{throw Error("Must not call")} })
assert.equal(unrelated.status,"not-applicable")
const requests=[]
const mock=async (url,options)=>{
  const parsed=new URL(url)
  requests.push({host:parsed.hostname,path:parsed.pathname,series:parsed.searchParams.get("facets[series][]"),key:parsed.searchParams.get("api_key"),opts:options})
  return {ok:true,json:async()=>mk(parsed.searchParams.get("facets[series][]"),parsed.searchParams.get("facets[series][]")==="RBRTE"?72.35:69.15)}
}
const result=await fetchEiaSpotEvidence("текущая цена нефти Brent и WTI",{key:"INTEGRATION_TEST_KEY",fetcher:mock,checkedAt:"2026-10-13T12:00:00.000Z"})
assert.equal(result.status,"verified-external-source")
assert.equal(result.points.length,2)
assert.deepEqual(requests.map(r=>r.series),["RBRTE","RWTC"])
assert.ok(requests.every(r=>r.host==="api.eia.gov" && r.path==="/v2/petroleum/pri/spt/data/" && r.key==="INTEGRATION_TEST_KEY"))
assert.match(result.context,/72.35/)
assert.match(result.context,/2026-10-12/)
assert.match(result.context,/2026-10-13T12:00:00/)
assert.doesNotMatch(result.context,/INTEGRATION_TEST_KEY/)
const partial=await fetchEiaSpotEvidence("current Brent WTI spot prices",{key:"TEST",fetcher:async u=>u.includes("RWTC")?{ok:false,status:429}:{ok:true,json:async()=>mk("RBRTE",73.8)}})
assert.equal(partial.status,"verified-external-source")
assert.equal(partial.points.length,1)
assert.match(partial.context,/Some requested series could not be retrieved/)
const failed=await fetchEiaSpotEvidence("latest Brent spot price",{key:"TEST",fetcher:async()=>({ok:false,status:403})})
assert.equal(failed.status,"unavailable")
assert.equal(failed.context,"")
console.log("Petroleum Open Science + optional EIA API: PASS (all fixtures mocked; no paid calls)")
