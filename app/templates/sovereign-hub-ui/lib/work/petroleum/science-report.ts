import type {ScienceInput,ScienceResult} from "./science-schema"
import {SCIENCE_METHODS} from "./science-methods"
import {verifyScience} from "./science-verify"
import type {PetroleumLanguage} from "./report"
const safe=(v:unknown)=>String(v??"—").replace(/[\r\n|<>`\\]/g," ").replaceAll("["," ").replaceAll("]"," ").slice(0,500)
const number=(v:number|null)=>v===null?"—":Number(v.toPrecision(9)).toString()
const labels={
  en:["Scientific calculation","Results","Input-derived calculation or model, not a verified field measurement.","Numerical checks","Scope and applicability","Conditional model curve; not measured or field-calibrated.","Reference method (not a live source lookup)","Missing data stay unknown; review all assumptions with an authorized engineer."],
  ru:["Научно-инженерный расчёт","Результаты","Расчёт или модель по заданным данным, не подтверждённое полевое измерение.","Численные проверки","Область применимости","Условная модельная кривая; не измерение и не калибровка по месторождению.","Справочный метод (без живого поиска)","Недостающие данные остаются неизвестными; допущения должен проверить уполномоченный инженер."],
  kk:["Ғылыми-инженерлік есептеу","Нәтижелер","Берілген деректер бойынша есептеу немесе модель, расталған далалық өлшем емес.","Сандық тексерулер","Қолданылу шегі","Шартты модель қисығы; өлшенген немесе кенорынға калибрленген дерек емес.","Анықтамалық әдіс (тікелей іздеусіз)","Жетіспейтін деректер белгісіз болып қалады; болжамдарды уәкілетті инженер тексеруі тиіс."],
  ar:["الحساب العلمي والهندسي","النتائج","حساب أو نموذج من المدخلات وليس قياساً حقلياً موثقاً.","الفحوص العددية","نطاق التطبيق","منحنى نموذج مشروط، وليس قياساً أو معايرة حقلية.","مرجع الطريقة (دون بحث مباشر)","تبقى البيانات المفقودة مجهولة؛ يلزم مراجعة الافتراضات من مهندس مخوّل."],
} as const
export function scienceReport(input:ScienceInput,result:ScienceResult,language:PetroleumLanguage,charts:boolean) {
  const l=labels[language],validation=verifyScience(input,result)
  if(!validation.ok)return `**SCIENCE_VALIDATION_FAILED** — ${safe(validation.errors.join(", "))}`
  const def=SCIENCE_METHODS[input.method],lines=[`## ${l[0]} — ${input.method}`,"",`${result.status} · ${result.version} · ${l[2]}`,"",`### ${l[1]}`,"","| Parameter | Value | Unit |","|---|---:|---|",...Object.entries(result.metrics).map(([key,m])=>`| ${safe(key)} | ${number(m.value)} | ${safe(m.unit)} |`),"",`${l[3]}: PASS (${validation.checked}) · model calls: 0 · ${number(result.execution.durationMs)} ms`,"",`### ${l[4]}`,"",safe(def.scope),"",l[7]]
  if(result.table){const table=result.table;lines.push("",`| ${table.columns.map(c=>`${safe(c.key)} (${safe(c.unit)})`).join(" | ")} |`,`|${table.columns.map(()=>"---").join("|")}|`,...table.rows.map(row=>`| ${row.map(v=>typeof v==="number"?number(v):safe(v)).join(" | ")} |`))}
  if(charts&&result.curve){
    const curve=result.curve,raw=input.method==="pvt-plot"||input.method==="log-plot",displayUnit=curve.yUnit==="reservoir/standard"?"res m3/std m3":curve.yUnit
    const provenance=raw?{en:"Supplied raw points. Provenance unverified; gaps are not interpolated.",ru:"Исходные точки пользователя. Происхождение не проверено; пропуски не интерполируются.",kk:"Пайдаланушының бастапқы нүктелері. Шығу тегі тексерілмеген; бос аралықтар интерполяцияланбайды.",ar:"نقاط خام مقدمة من المستخدم؛ المصدر غير موثق ولا يتم استيفاء الفجوات."}[language]:l[5]
    // The existing generic scatter renderer exposes its note visibly, but not axis-title
    // metadata in every layout. Keep units explicit without changing that shared UI.
    const note=`X: ${curve.xLabel} (${curve.xUnit}) · Y: ${curve.yLabel} (${curve.yUnit}). ${provenance}`
    lines.push("","```malik-visual",JSON.stringify({version:2,type:"chart",chart:"scatter",title:`${input.method} — ${l[1]}`,dataKind:input.dataKind==="synthetic"?"example":raw?"user":"estimate",unit:displayUnit,xLabel:`${curve.xLabel} (${curve.xUnit})`.slice(0,40),yLabel:`${curve.yLabel} (${curve.yUnit})`.slice(0,40),scatter:curve.series,note}),"```")
  }
  lines.push("",...result.warnings.map(w=>`- ${safe(w)}`),"",`[${l[6]}](${def.reference})`)
  return lines.join("\n")
}
