import type { PetroleumReceipt } from "./engine"
import { PETROLEUM_REFERENCES } from "./knowledge"
import type { analyzeProduction } from "./production"
export type PetroleumLanguage="ar"|"en"|"ru"|"kk"
export function petroleumLanguage(text:string):PetroleumLanguage {return /[\u0600-\u06ff]/.test(text)?"ar":/[әғқңөұүһі]/i.test(text)?"kk":/[а-яё]/i.test(text)?"ru":"en"}
const labels={
  en:["Engineering report","Data audit","Results","Method and variables","Assumptions and uncertainty","Evidence and limitations","Authorized engineer review required","No live source retrieval performed","Input measurements are user supplied and unverified","No result: check required inputs","Well","Last oil rate","Water cut","GOR","Accepted / rejected rows","Forecast"],
  ru:["Инженерный отчёт","Аудит данных","Результаты","Метод и переменные","Допущения и неопределённость","Достоверность и ограничения","Требуется проверка уполномоченного инженера","Живой поиск источников не выполнялся","Исходные измерения предоставлены пользователем и не верифицированы","Результат не получен: проверьте исходные данные","Скважина","Последний дебит нефти","Обводнённость","GOR","Принято / отклонено строк","Прогноз"],
  kk:["Инженерлік есеп","Деректер аудиті","Нәтижелер","Әдіс және айнымалылар","Болжамдар және белгісіздік","Дәлелдер мен шектеулер","Уәкілетті инженердің тексеруі қажет","Дереккөздерді тікелей іздеу орындалмады","Өлшемдер пайдаланушыдан алынған және тексерілмеген","Нәтиже алынбады: бастапқы деректерді тексеріңіз","Ұңғыма","Соңғы мұнай дебиті","Сулану","GOR","Қабылданған / қабылданбаған жолдар","Болжам"],
  ar:["التقرير الهندسي","تدقيق البيانات","النتائج","الطريقة والمتغيرات","الافتراضات وعدم اليقين","الأدلة والقيود","يلزم مراجعة مهندس مخوّل","لم يُجرَ بحث مباشر عن المصادر","القياسات مقدمة من المستخدم ولم يتم التحقق منها","لا توجد نتيجة: تحقق من المدخلات المطلوبة","البئر","آخر معدل نفط","نسبة الماء","نسبة الغاز إلى النفط","صفوف مقبولة / مستبعدة","التوقع"],
} as const
const safe=(text:unknown)=>String(text??"—").replace(/[\r\n|<>`]/g," ").slice(0,500)
const fmt=(value:number|null|undefined)=>value===null||value===undefined?"—":Number(value.toPrecision(8)).toString()
function flatten(value:unknown,prefix="",out:Array<[string,string]>=[]) {
  if(value && typeof value==="object") for(const [key,v]of Object.entries(value)) {if(out.length>=250)break;flatten(v,prefix?`${prefix}.${key}`:key,out)}
  else out.push([prefix,safe(value)])
  return out
}
export function petroleumReport(receipt:PetroleumReceipt,language:PetroleumLanguage="en",charts=true) {
  const l=labels[language], lines=[`# Malik Oil AI — ${l[0]}`,"",`**${receipt.ok?l[6]:l[9]}**`,"",`${receipt.version} · SHA-256: ${receipt.inputHash}`,"",l[8],"",`## ${l[3]}`,"",`\`${safe(receipt.method)}\``,"",safe(receipt.variables),"",safe(receipt.units)]
  const input = receipt.task && typeof receipt.task === "object" ? { ...(receipt.task as Record<string, unknown>) } : {}
  if ("text" in input) input.text = "Untrusted document text; preview below is inert, no instructions executed"
  if ("csv" in input) input.csv = "Production table fingerprint recorded above; retain original file for replay"
  lines.push("", `## ${language === "ar" ? "المدخلات" : language === "ru" ? "Исходные данные" : "Inputs"}`, "", "| Parameter | Value |", "|---|---|", ...flatten(input).map(([k,v])=>`| ${safe(k)} | ${safe(v)} |`))
  if(!receipt.ok) lines.push("",safe(receipt.error))
  const task=receipt.task as {op?:string}, result=receipt.result as ReturnType<typeof analyzeProduction>|undefined
  if (receipt.ok && task.op === "inline-production" && receipt.result) {
    const result = receipt.result as {
      rows: {period:string;oil:number;water:number;gas:number|null;waterCutPct:number|null;gor:number|null}[]
      oilChangePct:number|null
      oilDeclinePct:number|null
      gasReference:string|null
      periodPrecision:"month"|"day"
    }
    lines.push("", `## ${l[2]} — ${result.periodPrecision === "month" ? "Monthly" : "Daily"} production`, "",
      "| Period | Oil (bbl/day) | Water (bbl/day) | Gas (scf/day) | Water cut (%) | GOR (scf/bbl) |",
      "|---|---:|---:|---:|---:|---:|",
      ...result.rows.map(row => `| ${safe(row.period)} | ${fmt(row.oil)} | ${fmt(row.water)} | ${fmt(row.gas)} | ${fmt(row.waterCutPct)} | ${fmt(row.gor)} |`),
      "", `Oil-rate change (first to last): ${fmt(result.oilChangePct)}%; oil-rate decline: ${fmt(result.oilDeclinePct)}%.`,
      result.gasReference ? `Declared gas reference: ${safe(result.gasReference)} (not independently verified).`
        : "Gas reference T/P not supplied: GOR values are arithmetic ratios of the reported rates, not validated standard-condition equivalents.",
      "If zero oil rate, GOR and percent oil change may be undefined. No cumulative production was calculated.")
    if (charts) {
      lines.push("", "```malik-visual", JSON.stringify({
        version: 2, type: "chart", chart: "line", title: "Inline petroleum production — supplied rates",
        dataKind: "user", unit: "bbl/day", labels: result.rows.map(row => row.period),
        series: [
          { name: "Oil", values: result.rows.map(row => row.oil) },
          { name: "Water", values: result.rows.map(row => row.water) },
        ],
        note: "User-supplied rates; no field measurements verified",
      }), "```")
    }
  } else if(receipt.ok && task.op==="production" && result?.wells) {

    lines.push("",`## ${l[1]}`,"",`${l[14]}: ${result.audit.acceptedRows} / ${result.audit.rejectedRows}`,"",`| ${l[10]} | ${l[11]} (bbl/day) | ${l[12]} (%) | ${l[13]} (scf/bbl) |`,"|---|---|---|---|",
      ...result.wells.slice(0,100).map(w=>`| ${safe(w.well)} | ${fmt(w.lastRate)} | ${fmt(w.waterCutLast===null?null:w.waterCutLast*100)} | ${fmt(w.gorLast)} |`))
    if(result.wells.length>100)lines.push("",`Displayed 100 / ${result.wells.length} wells; full result available from petroleum API JSON.`)
    for(const issue of result.audit.issues.slice(0,30))lines.push(`- Row ${issue.row}: ${safe(issue.code)} — ${safe(issue.detail)}`)
    for(const w of result.wells.slice(0,10)) {
      lines.push("",`### ${safe(w.well)}`,"",`Change: ${fmt(w.changeFraction===null?null:w.changeFraction*100)}%; availability: ${fmt(w.availability)}; injection: ${fmt(w.injectionLast)} bbl/day`,"",...w.changes.map(c=>`- ${c.date}: ${fmt(c.change*100)}% (${c.flag})`),...w.issues.map(i=>`- ${i}`))
      if(w.forecastBlocked)lines.push(`- ${l[15]}: ${safe(w.forecastBlocked)}`)
      else lines.push("",`| Month | Low | Base | High (bbl/day) |`,"|---|---|---|---|",...w.forecast.map(f=>`| ${f.month} | ${fmt(f.low)} | ${fmt(f.base)} | ${fmt(f.high)} |`),`log-rate R² = ${w.fit.ok?fmt(w.fit.r2):"—"}`)
    }
    if(charts)for(const w of result.wells.slice(0,2)) {
      const history=w.history.slice(-400)
      lines.push("","```malik-visual",JSON.stringify({version:2,type:"chart",chart:"line",title:`${safe(w.well)} — ${l[11]}`,dataKind:"user",unit:"bbl/day",labels:history.map(p=>p.date),series:[{name:"Oil",values:history.map(p=>p.oil)}],note:l[8]}),"```")
      if(w.forecast.length)lines.push("","```malik-visual",JSON.stringify({version:2,type:"chart",chart:"line",title:`${safe(w.well)} — ${l[15]}`,dataKind:"estimate",unit:"bbl/day",labels:w.forecast.map(p=>String(p.month)),series:[{name:"Low",values:w.forecast.map(p=>p.low)},{name:"Base",values:w.forecast.map(p=>p.base)},{name:"High",values:w.forecast.map(p=>p.high)}],note:"Conditional scenarios, not confidence intervals / سيناريوهات مشروطة وليست فترات ثقة"}),"```")
    }
    lines.push("",...result.assumptions.map(v=>`- ${v}`))
    if("economics"in result)lines.push("",`## ${l[2]} — Economics`,"","| Parameter | Value |","|---|---|",...flatten(result.economics).map(([k,v])=>`| ${safe(k)} | ${safe(v)} |`))
  }else if(receipt.result!==undefined)lines.push("",`## ${l[2]}`,"","| Parameter | Value |","|---|---|",...flatten(receipt.result).map(([k,v])=>`| ${safe(k)} | ${safe(v)} |`))
  lines.push("",`## ${l[4]}`,"",...receipt.assumptions.map(v=>`- ${v}`),`- ${receipt.uncertainty}`,"",`## ${l[5]}`,"",receipt.evidence.join(" · "),"",...receipt.limitations.map(v=>`- ${v}`),"",l[7],"",...PETROLEUM_REFERENCES.map(s=>`- [${s.title}](${s.url}) — ${s.status}`))
  return lines.join("\n")
}
