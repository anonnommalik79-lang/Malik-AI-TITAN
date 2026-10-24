import { checkAccuracy, type AccuracyReport, type ClaimOrigin } from "./accuracy/engine"

export type ClaimStatus = "VERIFIED" | "SUPPORTED" | "UNCERTAIN" | "UNVERIFIED"
export type ClaimEvidence = { method: "deterministic" | "user-input" | "source-text-match" | "number-occurrence" | "expert-disagreement" | "none"; url?: string; observedAt?: string; excerpt?: string }
export type LedgerClaim = { id: string; text: string; origin: ClaimOrigin; status: ClaimStatus; evidence: ClaimEvidence[] }
export type ClaimLedger = { version: "malik-claim-ledger/1"; checkedAt: string; scope: "bounded-explicit-claims"; claims: LedgerClaim[]; counts: Record<ClaimStatus,number>; limits: string[] }
type Source = { url?: string; snippet?: string; readAt?: string; checkedAt?: string }
const normalize = (value: string) => value.replace(/\[\d{1,3}\]/g, "").replace(/\*\*|`/g, "").replace(/\s+/g," ").trim().toLowerCase()
const httpUrl = (value?: string) => { try { const url = new URL(value || ""); return url.protocol === "https:" && !url.username && !url.password ? url.href : undefined } catch { return undefined } }
const codeFree = (text: string) => text.replace(/```[\s\S]*?(?:```|$)/g," ").replace(/`[^`\n]+`/g," ")

/** Numeric disagreement is an observation, NOT a new truth vote. Deliberately
 * only same named metric + unit; scenario/assumption lines are excluded. No
 * review text, model identities or private reasoning leaves this function. */
export function labelledMetricDisagreements(reviews: readonly string[]): number {
  const metrics = new Map<string,Set<string>>()
  for (const review of reviews.slice(0,3)) {
    const local = new Map<string,Set<string>>()
    for (const line of codeFree(review.slice(0,12000)).split(/\r?\n/)) {
      if (/assum|scenario|forecast|допуще|сценари|прогноз/iu.test(line)) continue
      const match = /^\s*(?:[-*]\s*)?(MAU|MRR|ARR|ARPU|ARPPU|NPV|IRR|revenue|выручка|конверсия|conversion|price|цена)\s*[:=]\s*([$€₸]?)\s*([+-]?\d+(?:[.,]\d+)?)\s*(%|USD|EUR|KZT|RUB|₸)?\s*[.!]?\s*$/iu.exec(line)
      if (!match) continue
      const key = `${match[1].toLowerCase()}:${match[2]}${match[4] || ""}`
      const values=local.get(key)||new Set();values.add(match[3].replace(",","."));local.set(key,values)
    }
    for(const [key,values] of local) if(values.size===1){const all=metrics.get(key)||new Set();all.add([...values][0]);metrics.set(key,all)}
  }
  return [...metrics.values()].filter(values=>values.size>1).length
}

/** No model call, no confidence percentages and no inference that a URL or a
 * matching number proves a whole claim. Accuracy is re-evaluated on the FINAL
 * text; input reports are not allowed to bless a different streamed answer. */
function computeClaimLedger(input: { answer: string; prompt: string; sources?: readonly Source[]; expertDisagreements?: number }): ClaimLedger | null {
  if (/```/.test(input.answer)) return null // Software/configuration literals are not claims about the world.
  const answer=codeFree(input.answer.slice(0,60000))
  const sources=(input.sources || []).slice(0,16).map(source=>({...source,snippet:String(source?.snippet || "").slice(0,12000)}))
  const report: AccuracyReport=checkAccuracy(answer,input.prompt,sources).report
  const claims: LedgerClaim[]=[]
  const rows=answer.split(/\r?\n/)
  const seen=new Set<string>()
  for(let index=0;index<rows.length && claims.length<32;index++) {
    const raw=rows[index].trim(), text=normalize(raw)
    if(!text || seen.has(text) || raw.startsWith("#") || /https?:\/\/\S+/.test(raw) && /^[-*]?\s*\[/.test(raw)) continue
    const checked=report.claims.find(claim=>claim.line===index+1 && normalize(claim.text)===text)
    const cites=[...raw.matchAll(/\[(\d{1,3})\]/g)].map(match=>Number(match[1])-1)
    if(!checked && !cites.length && !/\d/.test(text) && !/^(?:допущение|прогноз|assumption|forecast)/iu.test(text)) continue
    if(/^[|\s:=-]+$/.test(raw)) continue
    seen.add(text)
    let origin: ClaimOrigin=/^(?:допуще|предполож|assum)/iu.test(text)?"assumption":/^(?:прогноз|forecast)/iu.test(text)?"forecast":checked?.origin || "external-fact"
    let status: ClaimStatus="UNVERIFIED"
    let evidence: ClaimEvidence[]=[{method:"none"}]
    const calculationOnly=/^(?:(?:ответ|результат|result|answer|итого|total)\s*:\s*)?[\d\s.,()+\-−×*·÷/%^=≈]+$/iu.test(text)
      || /^(?:платящие пользователи|выручка|месячная выручка|платёж за период|сумма после капитализации|paying users|revenue|monthly revenue|payment per period)\s*[:=]\s*[$€₸]?[\d\s.,/]+\s*(?:USD|EUR|KZT|₸|тенге|руб\.?|[$€])?[.!]?$/iu.test(text)
    if(checked?.evidence==="deterministic" && calculationOnly) {origin="calculation";status="VERIFIED";evidence=[{method:"deterministic",excerpt:checked.text.slice(0,240)}]}
    else if(origin==="user-data" && checked?.evidence==="user") {status="SUPPORTED";evidence=[{method:"user-input",excerpt:"Из исходных данных пользователя; их истинность не проверялась"}]}
    else if(origin==="assumption" || origin==="forecast") status="UNCERTAIN"
    else {
      const exact=cites.map(id=>sources[id]).find(source=>source?.readAt && Number.isFinite(Date.parse(source.readAt)) && httpUrl(source.url) && text.length>=25 && normalize(source.snippet || "").includes(text))
      if(exact) {status="VERIFIED";evidence=[{method:"source-text-match",url:httpUrl(exact.url),observedAt:exact.readAt,excerpt:raw.slice(0,240)}]}
      else if(checked?.evidence==="source-number-match") {
        status="SUPPORTED"
        evidence=cites.map(id=>sources[id]).filter(source=>source && httpUrl(source.url)).map(source=>({method:"number-occurrence" as const,url:httpUrl(source.url),observedAt:source.readAt || source.checkedAt,excerpt:"Совпали числа; смысл утверждения и применимость источника не доказаны"})).slice(0,3)
        if(!evidence.length){status="UNVERIFIED";evidence=[{method:"none"}]}
      }
    }
    if(report.issues.some(issue=>issue.line===index+1 && issue.resolution!=="corrected")) status="UNCERTAIN"
    claims.push({id:`claim-${index+1}`,text:raw.slice(0,450),origin,status,evidence})
  }
  if(input.expertDisagreements && claims.length) claims.push({id:"expert-disagreement",text:"В независимых модельных оценках различались значения одних и тех же показателей. Согласие моделей не является проверкой факта.",origin:"external-fact",status:"UNCERTAIN",evidence:[{method:"expert-disagreement"}]})
  if(!claims.length) return null
  const counts={VERIFIED:0,SUPPORTED:0,UNCERTAIN:0,UNVERIFIED:0}
  for(const claim of claims) counts[claim.status]++
  return {version:"malik-claim-ledger/1",checkedAt:new Date().toISOString(),scope:"bounded-explicit-claims",claims,counts,
    limits:["Только распознанные явные утверждения; не полная проверка ответа","Совпадение текста доказывает наличие в прочитанном отрывке, не истинность, свежесть или применимость источника",...(input.answer.length>60000?["Проверены первые 60000 символов"]:[])]}
}

/** Auditing must never interrupt delivery of the original answer. Null never
 * claims success; it means this layer supplied no verification evidence. */
export function buildClaimLedger(input: Parameters<typeof computeClaimLedger>[0]): ClaimLedger | null {
  try { return computeClaimLedger(input) } catch { return null }
}

export function normalizeClaimLedger(raw: unknown): ClaimLedger | null {
  if(!raw || typeof raw!=="object")return null
  const value=raw as ClaimLedger
  if(value.version!=="malik-claim-ledger/1" || !Array.isArray(value.claims) || value.claims.length>33 || !Number.isFinite(Date.parse(value.checkedAt)))return null
  if(value.claims.some(claim=>!claim || !["VERIFIED","SUPPORTED","UNCERTAIN","UNVERIFIED"].includes(claim.status) || typeof claim.text!=="string" || !Array.isArray(claim.evidence)))return null
  const counts={VERIFIED:0,SUPPORTED:0,UNCERTAIN:0,UNVERIFIED:0}
  const claims: LedgerClaim[]=value.claims.map((claim,index)=>{
    const origin: ClaimOrigin=["user-data","calculation","external-fact","assumption","forecast"].includes(claim.origin)?claim.origin:"external-fact"
    const evidence: ClaimEvidence[]=claim.evidence.slice(0,3)
      .filter(item=>item && ["deterministic","user-input","source-text-match","number-occurrence","expert-disagreement","none"].includes(item.method))
      .map(item=>({method:item.method,url:httpUrl(item.url),observedAt:typeof item.observedAt==="string" && Number.isFinite(Date.parse(item.observedAt))?item.observedAt:undefined,excerpt:String(item.excerpt||"").slice(0,240)}))
    let status=claim.status
    if(status==="VERIFIED" && !evidence.some(item=>(item.method==="deterministic"&&origin==="calculation") || (item.method==="source-text-match"&&item.url&&item.observedAt&&item.excerpt)))status="UNVERIFIED"
    if(status==="SUPPORTED" && !evidence.some(item=>(item.method==="user-input"&&origin==="user-data") || (item.method==="number-occurrence"&&item.url)))status="UNVERIFIED"
    counts[status]++
    return {id:`claim-${index+1}`,text:claim.text.slice(0,450),origin,status,evidence}
  })
  return {version:value.version,checkedAt:value.checkedAt,scope:"bounded-explicit-claims",claims,counts,limits:Array.isArray(value.limits)?value.limits.slice(0,5).map(line=>String(line).slice(0,300)):[]}
}
