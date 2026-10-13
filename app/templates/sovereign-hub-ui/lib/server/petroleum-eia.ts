/**
 * Official US EIA daily Brent/WTI spot-price connector.
 * Optional server-side only: no network call when EIA_API_KEY is unset or user
 * asks a hypothetical-price question. EIA is NOT field telemetry or forecasting.
 */
export type EiaSpotSeries = "RBRTE" | "RWTC"
export type EiaSpotPoint = { series:EiaSpotSeries; period:string; value:number; units:"$/BBL" }
export type EiaSpotEvidence = {
  status:"not-applicable"|"not-configured"|"unavailable"|"verified-external-source"
  context:string
  points:EiaSpotPoint[]
}
export function requestedEiaSpotSeries(prompt:string): EiaSpotSeries[] {
  const text=String(prompt || "").slice(0,2500)
  const names=/(?:(?:brent|брент|wti|west\s+texas)|нефт(?:ь|и|яной|яного)).*/iu.test(text)
  const price=/(?:цен[ауыеой]|стоимост|price|spot|котиров|market|рын[оы]к|сколько.*(?:стоит|баррел))/iu.test(text)
  if(!names||!price)return[]
  // Do not treat investment scenario assumptions as live spot quotes.
  if(/(?:гипотетич|условн.*цен|scenario|сценари.*(?:\$|цен)|assum(?:e|ption)|допущени)/iu.test(text) &&
     !/(?:актуальн|сегодня|текущ|latest|current|real.price|официальн.*цен)/iu.test(text))return[]
  const selected:EiaSpotSeries[]=[]
  if(/brent|брент/iu.test(text))selected.push("RBRTE")
  if(/\bWTI\b|west\s+texas/iu.test(text))selected.push("RWTC")
  return selected.length?selected:[]
}
export function parseEiaSpotResponse(payload:unknown, requested:EiaSpotSeries):EiaSpotPoint {
  const rows=(payload as {response?:{data?:unknown}})?.response?.data
  if(!Array.isArray(rows)||!rows.length)throw Error("EIA: empty result")
  const found=rows.find(item=>item && typeof item==="object" &&
    (item as any).series===requested && /^\d{4}-\d{2}-\d{2}$/.test(String((item as any).period||"")))
  if(!found)throw Error("EIA: requested series absent")
  const row=found as Record<string,unknown>
  // EIA may serialize numeric data as strings.
  if(typeof row.value!=="number" && typeof row.value!=="string")throw Error("EIA: missing numeric value")
  const value=Number(row.value)
  if(!Number.isFinite(value)||value<=0||value>10000)throw Error("EIA: invalid spot price")
  const units=String(row.units||"").trim().toUpperCase()
  if(units!=="$/BBL"&&units!=="DOLLARS PER BARREL")throw Error("EIA: incompatible price units")
  const period=String(row.period)
  const dt=new Date(period+"T00:00:00Z")
  if(Number.isNaN(dt.getTime())||dt.toISOString().slice(0,10)!==period)throw Error("EIA: invalid period")
  return {series:requested,period,value,units:"$/BBL"}
}
export async function fetchEiaSpotEvidence(
  prompt:string,
  options:{key?:string;fetcher?:typeof fetch;signal?:AbortSignal;checkedAt?:string}={},
):Promise<EiaSpotEvidence> {
  const requested=requestedEiaSpotSeries(prompt)
  if(!requested.length)return{status:"not-applicable",context:"",points:[]}
  const key=(options.key??process.env.EIA_API_KEY??"").trim()
  if(!key)return{status:"not-configured",context:"",points:[]}
  const controller=new AbortController()
  const abort=()=>controller.abort()
  if(options.signal?.aborted)return{status:"unavailable",context:"",points:[]}
  options.signal?.addEventListener("abort",abort,{once:true})
  const timeout=setTimeout(abort,4500)
  try{
    const output=await Promise.allSettled(requested.map(async series=>{
      const url=new URL("https://api.eia.gov/v2/petroleum/pri/spt/data/")
      url.searchParams.set("api_key",key)
      url.searchParams.set("frequency","daily")
      url.searchParams.set("data[0]","value")
      url.searchParams.set("facets[series][]",series)
      url.searchParams.set("sort[0][column]","period")
      url.searchParams.set("sort[0][direction]","desc")
      url.searchParams.set("offset","0")
      url.searchParams.set("length","1")
      const response=await (options.fetcher||fetch)(url.toString(),{signal:controller.signal,headers:{accept:"application/json"}})
      if(!response.ok)throw Error("EIA API unavailable")
      return parseEiaSpotResponse(await response.json(),series)
    }))
    const points=output.filter((r):r is PromiseFulfilledResult<EiaSpotPoint>=>r.status==="fulfilled").map(r=>r.value)
    if(!points.length)return{status:"unavailable",context:"",points:[]}
    const checkedAt=options.checkedAt||new Date().toISOString()
    const context=[
      "[EIA_VERIFIED_EXTERNAL_SOURCE]",
      "Live response received from official US EIA API v2; this is the latest PUBLISHED daily spot observation, not necessarily a live market quote.",
      ...points.map(p=>`${p.series==="RBRTE"?"Europe Brent":"Cushing WTI"} (EIA ${p.series}): ${p.value} ${p.units} on ${p.period}`),
      "Source: https://www.eia.gov/opendata/browser/petroleum/pri/spt",
      "Retrieved at: "+checkedAt,
      points.length!==requested.length?"Some requested series could not be retrieved; do not infer their prices.":"",
      "No investment recommendation or field-specific sales realization is implied; differentiate spot benchmark from realized price and add transport, differentials, taxation and uncertainty.",
      "[/EIA_VERIFIED_EXTERNAL_SOURCE]",
    ].filter(Boolean).join("\n")
    return{status:"verified-external-source",context,points}
  }catch{return{status:"unavailable",context:"",points:[]}}
  finally{clearTimeout(timeout);options.signal?.removeEventListener("abort",abort)}
}
