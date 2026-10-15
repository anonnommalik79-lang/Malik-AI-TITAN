import {createHash} from "node:crypto"
import {z} from "zod"
import type {PetroleumReceipt} from "./engine"
import type {OilLanguage,PetroleumAnalysisResult} from "./analysis-contract"
import {requestsOilModelInterpretation} from "./expert-routing"
import {routingScope} from "../../ai/prompt-shape"

export type OilReviewFact={id:string;label:string;value:number;unit:string;origin:"supplied"|"calculated"|"modelled"}
export type OilReviewEvidence={version:"oil-evidence-review-1";inputHash:string;engineVersion:string;method:string;dataKind:string;facts:OilReviewFact[];truncated:boolean;limitations:string[];hash:string}
const clean=(s:string)=>s.replace(/[\r\n<>`[\]{}]/g," ").slice(0,200)
const fact=(facts:OilReviewFact[],label:string,value:number,unit:string,origin:OilReviewFact["origin"])=>facts.push({id:`F${facts.length}`,label:clean(label),value,unit:clean(unit),origin})
/** Only numeric, bounded, schema-validated results reach the interpretation model.
 * File bodies, document instructions, secrets in free-form notes and history do not. */
export function receiptReviewEvidence(receipt:PetroleumReceipt):OilReviewEvidence|null {
  if(!receipt.ok||receipt.result===undefined)return null
  const task=receipt.task as {op?:string;currency?:string;input?:{method?:string;dataKind?:string;currency?:string}}
  const facts:OilReviewFact[]=[];let truncated=false,visited=0
  const currency=task.currency||task.input?.currency||""
  const visit=(value:unknown,path:string,origin:OilReviewFact["origin"],depth=0)=>{
    if(facts.length>=80||visited++>=1200||depth>10){truncated=true;return}
    if(typeof value==="number"&&Number.isFinite(value)){fact(facts,path,value,/\.npv$|\.baselineNpv$/.test(path)?currency:/\.irr\.rate$/.test(path)?"fraction":"",origin);return}
    if(!value||typeof value!=="object")return
    const v=value as Record<string,unknown>
    if(typeof v.value==="number"&&Number.isFinite(v.value)&&typeof v.unit==="string"){fact(facts,path,v.value,v.unit,origin);return}
    if(Array.isArray(value)){for(let i=0;i<value.length;i++){if(facts.length>=80||visited>=1200){truncated=true;break}visit(value[i],`${path}.${i}`,origin,depth+1)};return}
    for(const key of Object.keys(v)){
      if(facts.length>=80||visited>=1200){truncated=true;break}
      if(!/^(?:csv|text|excerpt|sourceDocument|history|audit|execution|provenance|sourceHash|inputHash|warnings|limitations)$/.test(key))visit(v[key],`${path}.${clean(key)}`,origin,depth+1)
    }
  }
  const modelled=typeof receipt.result==="object"&&receipt.result!==null&&Reflect.get(receipt.result,"status")==="MODELLED"
  visit(receipt.result,"result",modelled?"modelled":"calculated")
  visit(receipt.task,"input","supplied")
  return sealEvidence({version:"oil-evidence-review-1",inputHash:receipt.inputHash,engineVersion:receipt.version,method:task.input?.method||task.op||"unknown",dataKind:task.input?.dataKind||"user-unverified",facts,truncated,limitations:[...receipt.limitations,...receipt.assumptions].slice(0,24).map(clean)})
}
export function tableReviewEvidence(result:PetroleumAnalysisResult,inputHash:string):OilReviewEvidence {
  const metrics=result.calculatedMetrics.filter(m=>m.value!==null&&Number.isFinite(m.value))
  const facts:OilReviewFact[]=[]
  for(const metric of metrics.slice(0,80))fact(facts,`${metric.well}: ${metric.id}`,metric.value!,metric.unit,metric.evidence==="Statistical Estimate"?"modelled":"calculated")
  return sealEvidence({version:"oil-evidence-review-1",inputHash,engineVersion:result.engineVersion,method:"production-history",dataKind:result.sourceSummary.dataKind,facts,truncated:metrics.length>80,limitations:result.limitations.slice(0,12).map(clean)})
}
function sealEvidence(input:Omit<OilReviewEvidence,"hash">):OilReviewEvidence{return {...input,hash:createHash("sha256").update(JSON.stringify(input)).digest("hex")}}
export function needsOilModelReview(prompt:string,modelId:string) {
  // Quoted examples/file instructions are data, not a request to disable review.
  // Keep this local to the Oil review opt-out; do not change ordinary chat routing.
  const intent=routingScope(prompt.replace(/```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$)|^\s*>[^\n]*|"[^"\n]*"|«[^»\n]*»|“[^”\n]*”/gm," "))
  if(/(?:без\s+(?:модел\p{L}*|интерпретаци\p{L}*)|только\s+(?:расч[её]т|числа)|(?:calculation|numbers)\s+only|no\s+model\s+(?:review|interpretation)|тек\s+есеп|حساب\s+فقط)/iu.test(intent))return false
  return modelId==="malik-oil-1tb"||modelId==="malik-max"||requestsOilModelInterpretation(intent)
}
const prose=z.string().trim().min(3).max(700)
export const oilModelReviewSchema=z.object({
  conclusion:prose,
  findings:z.array(z.object({kind:z.enum(["interpretation","hypothesis"]),factIds:z.array(z.string().regex(/^F\d{1,2}$/)).min(1).max(5),text:prose}).strict()).min(1).max(6),
  assumptions:z.array(prose).max(6),missingData:z.array(prose).max(8),nextChecks:z.array(prose).min(1).max(6),limitations:z.array(prose).min(1).max(6),
}).strict()
export type OilModelReview=z.infer<typeof oilModelReviewSchema>
/** Numeric observations are rendered from engine references, never retyped by a model.
 * This checks the output contract, NOT the truth of every qualitative hypothesis. */
export function parseOilModelReview(raw:string,evidence:OilReviewEvidence):OilModelReview {
  if(raw.length>24_000)throw new Error("REVIEW_TOO_LARGE")
  const stripped=raw.trim().replace(/^```(?:json)?\s*\n([\s\S]*?)\n```$/i,"$1")
  let value:unknown
  try{value=JSON.parse(stripped)}catch{throw new Error("REVIEW_JSON_REQUIRED")}
  const parsed=oilModelReviewSchema.safeParse(value)
  if(!parsed.success)throw new Error("REVIEW_SCHEMA")
  const review=parsed.data,ids=new Set(evidence.facts.map(f=>f.id))
  for(const finding of review.findings)if(finding.factIds.some(id=>!ids.has(id)))throw new Error("REVIEW_UNKNOWN_EVIDENCE")
  const texts=[review.conclusion,...review.findings.map(f=>f.text),...review.assumptions,...review.missingData,...review.nextChecks,...review.limitations]
  for(const text of texts){
    // Chemical formula names are identifiers, not numerical performance claims.
    const numeric=text.replace(/\b(?:CO2|H2S|CH4)\b|CO₂|H₂S|CH₄/gu,"")
    if(/\p{N}/u.test(numeric))throw new Error("REVIEW_NUMBERS_MUST_REFERENCE_ENGINE")
    if(/```|[<>]|https?:|\]\(|malik-oil-report|\[\d+\]/iu.test(text))throw new Error("REVIEW_UNTRUSTED_MARKUP")
    const certainty=text.replace(/не\s+гарантир\p{L}*|(?:no|not|cannot|does\s+not)\s+guarantee\w*|not\s+field[- ]verified/giu,"")
    if(/гарантир\p{L}*|guarantee\w*|field[- ]verified|certified\s+reserves|подтвержд[её]н\p{L}*\s+(?:месторожд|запас)|откр\p{L}*\s+задвиж|закр\p{L}*\s+задвиж|(?:open|close)\s+(?:the\s+)?valve/iu.test(certainty))throw new Error("REVIEW_UNSUPPORTED_CERTAINTY_OR_CONTROL")
  }
  return review
}
const copy:Record<OilLanguage,{title:string;hypothesis:string;interpretation:string;assumptions:string;missing:string;checks:string;limits:string;note:string;failure:string}>={
  ru:{title:"Инженерный разбор модели",hypothesis:"Гипотеза",interpretation:"Интерпретация",assumptions:"Допущения",missing:"Недостающие данные",checks:"Следующие проверки",limits:"Ограничения",note:"Числовые ссылки проверены по движку. Смысловые выводы модели требуют проверки инженером; полевые испытания не подтверждены.",failure:"Модельный разбор не получен или не прошёл проверку. Расчёт сохранён; участие модели в принятом разборе не подтверждено."},
  en:{title:"Model engineering review",hypothesis:"Hypothesis",interpretation:"Interpretation",assumptions:"Assumptions",missing:"Missing data",checks:"Next checks",limits:"Limitations",note:"Numeric references match the engine. Qualitative model conclusions need engineer review; field testing is not established.",failure:"The model review was unavailable or failed validation. The calculation is kept; no accepted model review is confirmed."},
  kk:{title:"Модельдің инженерлік талдауы",hypothesis:"Гипотеза",interpretation:"Түсіндірме",assumptions:"Болжамдар",missing:"Жетіспейтін деректер",checks:"Келесі тексерулер",limits:"Шектеулер",note:"Сандық сілтемелер қозғалтқышпен тексерілді. Модель қорытындысын инженер тексеруі керек; далалық сынақ расталмаған.",failure:"Модель талдауы алынбады немесе тексеруден өтпеді. Есеп сақталды; қабылданған модель талдауы расталмаған."},
  ar:{title:"التحليل الهندسي للنموذج",hypothesis:"فرضية",interpretation:"تفسير",assumptions:"الافتراضات",missing:"البيانات الناقصة",checks:"الفحوص التالية",limits:"القيود",note:"تمت مطابقة المراجع الرقمية مع المحرك. الاستنتاجات النوعية تتطلب مراجعة مهندس؛ الاختبارات الميدانية غير مثبتة.",failure:"تعذر التحليل أو لم يجتز التحقق. تم الاحتفاظ بالحساب؛ لا يوجد تحليل نموذج مقبول مؤكد."},
}
const markdown=(text:string)=>text.replace(/[\r\n]/g," ").replace(/([\\`*_{}[\]<>#|])/g,"\\$1")
export function renderOilModelReview(review:OilModelReview,evidence:OilReviewEvidence,language:OilLanguage) {
  const c=copy[language],facts=new Map(evidence.facts.map(f=>[f.id,f]))
  const lines=[`### ${c.title}`,"",markdown(review.conclusion),""]
  if(evidence.truncated)lines.push("> "+{
    ru:"Модели передана только ограниченная часть расчётных фактов. Этот разбор не охватывает все скважины и периоды исходного отчёта.",
    en:"The model received only a bounded subset of calculation facts. This review does not cover all wells and periods in the original report.",
    kk:"Модельге есеп фактілерінің шектеулі бөлігі ғана берілді. Бұл талдау бастапқы есептің барлық ұңғымалары мен кезеңдерін қамтымайды.",
    ar:"تلقى النموذج مجموعة محدودة من حقائق الحساب فقط. لا يشمل هذا التحليل جميع الآبار والفترات في التقرير الأصلي.",
  }[language],"")
  for(const finding of review.findings){lines.push(`- **${finding.kind==="hypothesis"?c.hypothesis:c.interpretation}:** ${markdown(finding.text)}`);for(const id of finding.factIds){const f=facts.get(id)!;lines.push(`  - ${markdown(f.label)}: **${String(f.value)}** ${markdown(f.unit)} (${f.origin})`)}}
  for(const [label,items]of [[c.assumptions,review.assumptions],[c.missing,review.missingData],[c.checks,review.nextChecks],[c.limits,review.limitations]] as const)if(items.length)lines.push("",`#### ${label}`,"",...items.map(t=>`- ${markdown(t)}`))
  lines.push("",`> ${c.note}`,"",`Evidence SHA-256: \`${evidence.hash}\``)
  return lines.join("\n")
}
export function unavailableOilModelReview(language:OilLanguage){return copy[language].failure}
export function oilReviewParticipation(language:OilLanguage,label:string,attempts:number,accepted:boolean,participants?:number,synthesized?:boolean){
  const c={
    ru:{model:"Модель",accepted:"Разбор принят",attempts:"Попыток маршрута",participants:"Ответивших маршрутов",synthesis:"Сведение подтверждено",yes:"да",no:"нет",kernel:"Показатель model calls в расчётном протоколе относится только к численному движку, не к этому разбору."},
    en:{model:"Model",accepted:"accepted review",attempts:"route attempts",participants:"participating routes",synthesis:"synthesis confirmed",yes:"yes",no:"no",kernel:"The calculation protocol's model calls field covers only the numeric engine, not this review."},
    kk:{model:"Модель",accepted:"Талдау қабылданды",attempts:"Маршрут әрекеттері",participants:"Жауап берген маршруттар",synthesis:"Біріктіру расталды",yes:"иә",no:"жоқ",kernel:"Есеп хаттамасындағы model calls тек сандық қозғалтқышқа қатысты, бұл талдауға емес."},
    ar:{model:"النموذج",accepted:"تم قبول التحليل",attempts:"محاولات المسار",participants:"المسارات المستجيبة",synthesis:"تم تأكيد الدمج",yes:"نعم",no:"لا",kernel:"يشمل حقل model calls في بروتوكول الحساب المحرك الرقمي فقط، وليس هذا التحليل."},
  }[language]
  return `${c.model}: ${markdown(label)} · ${c.accepted}: ${accepted?c.yes:c.no} · ${c.attempts}: ${attempts}`+(participants===undefined?"":` · ${c.participants}: ${participants}/3 · ${c.synthesis}: ${synthesized?c.yes:c.no}`)+"\n\n"+c.kernel
}
