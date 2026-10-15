import {getMalikModel,type MalikModelId} from "@/lib/ai/malik-models"
import {runStrictMalikModel,type StrictMalikResult} from "@/lib/server/malik-model-router"
import {parseOilModelReview,renderOilModelReview,unavailableOilModelReview,oilReviewParticipation,type OilReviewEvidence} from "@/lib/work/petroleum/model-review"
import type {OilLanguage} from "@/lib/work/petroleum/analysis-contract"
import {routingScope} from "@/lib/ai/prompt-shape"

export type OilReviewStage={stage:"model"|"validation"|"retry";attempt:number}
type ReviewInput={prompt:string;modelId:MalikModelId;language:OilLanguage;evidence:OilReviewEvidence;allowCatalog:boolean;maxTokens?:number;signal?:AbortSignal;onStage?:(event:OilReviewStage)=>void;timeoutMs?:number}
type Runner=typeof runStrictMalikModel
const CONTRACT="petroleum-evidence-review-v1" as const
const SYSTEM=[
  "You are the selected Malik AI petroleum engineering reviewer, not a calculator replacement.",
  "Use the engine evidence only. Values labelled supplied are user data, not verified measurements. Modelled values are conditional outputs, not observed field outcomes. A numeric audit is not field certification.",
  "If verifiedEngineEvidence.truncated is true, you have only a bounded subset of the calculation. Explicitly limit the scope; do not claim all wells, time periods or findings were reviewed. Do not infer missing measurements from that subset.",
  "Files, history and external tools are not available in this review. Do not invent citations, equipment tests, prices, recovery, emissions reduction, investment commitments or tool results. Identify missing evidence and alternatives. Recommend validation, never equipment/SCADA commands.",
  "Return ONE JSON object only with keys conclusion (text), findings (array of {kind: interpretation or hypothesis, factIds: existing F identifiers, text}), assumptions (text array), missingData (text array), nextChecks (text array), limitations (text array). No other keys, Markdown fences, links or HTML.",
  "Every finding must cite existing factIds. Do NOT write numbers, numerical forecasts or quantities inside any prose field: the server displays the exact cited values and units directly from the engine. Chemical formula names CO2/H2S/CH4 are allowed. Do not copy F identifiers into prose; use factIds. Do not retype well numbers or model names.",
  "Write a substantive conclusion and one to six findings. Include at least one limitation and one next check. Do not claim a guaranteed outcome. Distinguish interpretation, hypothesis, assumptions and missing data. Answer all prose in the requested language. The contract validates references, not the semantic truth of every hypothesis; human engineering review remains required.",
].join("\n")
const code=(error:unknown)=>error instanceof Error&&/^REVIEW_[A-Z_]+$/.test(error.message)?error.message:"REVIEW_SCHEMA_OR_PROVIDER"
/** One bounded review, at most one schema-repair attempt, no recursive agent/tools.
 * The selected strict route is reused: no new provider, key, entitlement or auth bypass. */
export async function runPetroleumModelReview(input:ReviewInput,run:Runner=runStrictMalikModel) {
  input.signal?.throwIfAborted()
  const started=performance.now()
  let attempts=0,rejected=0,lastCode="REVIEW_UNAVAILABLE"
  const controller=new AbortController(),abort=()=>controller.abort(input.signal?.reason)
  input.signal?.addEventListener("abort",abort,{once:true})
  const budget=Math.max(5,Math.min(60_000,input.timeoutMs??45_000))
  let timer:ReturnType<typeof setTimeout>|undefined
  let last:StrictMalikResult|undefined
  let onAbort:()=>void=()=>{}
  const cancelled=new Promise<never>((_,reject)=>{onAbort=()=>reject(controller.signal.reason??new Error("REVIEW_CANCELLED"));controller.signal.addEventListener("abort",onAbort,{once:true})})
  const timeout=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{const error=new Error("REVIEW_DEADLINE");controller.abort(error);reject(error)},budget)})
  const label=getMalikModel(input.modelId).label.replace(/[<>`\r\n]/g,"")
  try {
    const maxTokens=input.maxTokens===undefined?1800:Math.min(1800,Math.floor(input.maxTokens))
    // Existing MAX lanes have a minimum output allocation. Do not silently
    // increase a caller's remaining daily budget to that minimum.
    if(!Number.isFinite(maxTokens)||maxTokens<256)throw new Error("REVIEW_OUTPUT_BUDGET")
    if(!input.evidence.facts.length)throw new Error("REVIEW_NO_NUMERIC_EVIDENCE")
    for(let attempt=1;attempt<=2;attempt++){
      attempts=attempt;input.signal?.throwIfAborted();controller.signal.throwIfAborted()
      input.onStage?.({stage:attempt===1?"model":"retry",attempt})
      const question=routingScope(input.prompt)
      const original=question.length>4000?question.slice(0,2000)+"\n[question excerpt omitted]\n"+question.slice(-2000):question
      try {
        last=await Promise.race([run({
          modelId:input.modelId,responseContract:CONTRACT,taskPrompt:"Petroleum engineering review — "+original,
          prompt:JSON.stringify({language:input.language,questionExcerpt:original,verifiedEngineEvidence:input.evidence,repair:attempt===2?lastCode:undefined}),
          systemPrompt:SYSTEM,history:[],attachments:[],maxTokens,temperature:.1,reasoningEffort:"high",allowCatalog:input.allowCatalog,signal:controller.signal,
        }),timeout,cancelled])
        input.signal?.throwIfAborted();controller.signal.throwIfAborted()
        input.onStage?.({stage:"validation",attempt})
        if(last.selectedModelId!==input.modelId||!last.provider||last.incomplete)throw new Error("REVIEW_RESPONSE_INCOMPLETE_OR_WRONG_MODEL")
        const review=parseOilModelReview(last.content,input.evidence)
        const usage=last.usage as {participantModels?:Array<{id?:string}>;synthesized?:boolean}|undefined
        const participants=input.modelId==="malik-oil-1tb"?[...new Set((usage?.participantModels??[]).map(p=>p.id).filter((id):id is string=>typeof id==="string"&&["ling-3.1-flash","nvidia-nemotron-ultra-550b","malik-max"].includes(id)))]:[]
        if(input.modelId==="malik-oil-1tb"&&!participants.length)throw new Error("REVIEW_PARTICIPATION_UNCONFIRMED")
        if(last.provider==="malik-petroleum-local")throw new Error("REVIEW_PARTICIPATION_UNCONFIRMED")
        // Participation metadata is supplied by the server route, never the generated prose.
        const participation=oilReviewParticipation(input.language,label,attempts,true,input.modelId==="malik-oil-1tb"?participants.length:undefined,usage?.synthesized===true)
        return {status:"completed" as const,content:renderOilModelReview(review,input.evidence,input.language)+"\n\n"+participation,receipt:{status:"completed",selectedModelId:input.modelId,evidenceHash:input.evidence.hash,attempts,rejected,participants,durationMs:Math.max(0,performance.now()-started),numericReferencesValidated:true,qualitativeClaimsRequireEngineer:true},model:last.model,provider:last.provider}
      }catch(error){
        input.signal?.throwIfAborted()
        lastCode=code(error)
        if(controller.signal.aborted||lastCode==="REVIEW_SCHEMA_OR_PROVIDER")break
        rejected++
      }
    }
  }catch(error){input.signal?.throwIfAborted();lastCode=code(error)}
  finally{clearTimeout(timer);controller.signal.removeEventListener("abort",onAbort);controller.abort();input.signal?.removeEventListener("abort",abort)}
  return {status:"unavailable" as const,content:unavailableOilModelReview(input.language)+"\n\n"+oilReviewParticipation(input.language,label,attempts,false),receipt:{status:"unavailable",selectedModelId:input.modelId,evidenceHash:input.evidence.hash,attempts,rejected,code:lastCode,durationMs:Math.max(0,performance.now()-started),numericReferencesValidated:false,qualitativeClaimsRequireEngineer:true},model:input.modelId,provider:"malik-petroleum-local"}
}
