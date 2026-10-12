import { readXlsx } from "../../os/data/xlsx"
import { runPetroleum, type PetroleumReceipt } from "./engine"
import { routePetroleum, stripPetroleumToken } from "./router"
import { petroleumReport, petroleumLanguage } from "./report"
import { normalizeDigits } from "./production"
type Attachment={name?:string;mime?:string;text?:string;base64?:string;size?:number}
const MAX_BYTES=4*1024*1024
function attachmentCsv(file:Attachment) {
  const extension=file.name?.split('.').pop()?.toLowerCase()
  if(!["csv","xlsx","tsv"].includes(extension||""))throw new Error("Local petroleum import supports CSV/TSV/XLSX only. PDF/DOCX require a separately validated extraction workflow; no file sent to AI provider.")
  if(file.size && file.size>MAX_BYTES || (file.base64?.length||0)>Math.ceil(MAX_BYTES*4/3)+4 || (file.text?.length||0)>MAX_BYTES)throw new Error("FILE_TOO_LARGE: 4 MB maximum")
  const allowedMime = extension === "xlsx" ? ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/octet-stream"] : ["text/csv", "text/plain", "text/tab-separated-values", "application/csv", "application/vnd.ms-excel", "application/octet-stream"]
  if (file.mime && !allowedMime.includes(file.mime.split(";")[0])) throw new Error("FILE_MIME_MISMATCH")
  if(extension!=="xlsx" && file.text!==undefined) { if (file.text.includes("\0")) throw new Error("CSV_BINARY_CONTENT"); return file.text }
  if(!file.base64 || !/^[A-Za-z0-9+/]*={0,2}$/.test(file.base64))throw new Error("Missing/invalid base64 file bytes")
  const bytes=Buffer.from(file.base64,"base64")
  if(!bytes.length||bytes.length>MAX_BYTES)throw new Error("Empty/oversized file")
  if(extension==="xlsx") {
    if(bytes[0]!==0x50||bytes[1]!==0x4b)throw new Error("XLSX_SIGNATURE")
    const rows=readXlsx(bytes,{rows:20002,columns:31})
    return rows.map(row=>row.map(c=>'"'+c.replace(/"/g,'""')+'"').join(',')).join('\n')
  }
  return new TextDecoder("utf-8",{fatal:true}).decode(bytes)
}
export function taskFromPetroleumPrompt(prompt:string):unknown|null {
  const text=normalizeDigits(stripPetroleumToken(prompt))
  const json=text.match(/```(?:petroleum|json)\s*\n([\s\S]*?)\n```/i)?.[1] || (text.trim().startsWith('{')?text.trim():null)
  if(json) {try{return JSON.parse(json)}catch{return {op:"invalid-json"}}}
  // Explicit structured numeric notation only. No guesses from unlabeled numbers.
  const flows=text.match(/(?:cashflows|денежные потоки|التدفقات النقدية)\s*[:=]\s*\[([^\]]+)\]/iu)
  if(flows && /NPV|IRR/iu.test(text)) {
    const cashflows=flows[1].split(/[,;]/).map(v=>Number(v.trim()))
    const rate=text.match(/(?:rate|ставка|معدل الخصم)\s*[:=]\s*(\d+(?:\.\d+)?)\s*%/iu)
    const period=text.match(/(?:period|период)\s*[:=]\s*(year|month)/iu)?.[1]
    const currency=text.match(/(?:currency|валюта)\s*[:=]\s*([A-Z]{3})/i)?.[1]?.toUpperCase()
    if(rate&&period&&currency)return {op:"npv",cashflows,rate:Number(rate[1])/100,period,currency}
  }
  const oil=text.match(/(?:oil|нефть|نفط)\s*[:=]\s*(\d+(?:\.\d+)?)\s*(bbl\/day|m3\/day)/iu)
  const water=text.match(/(?:water|вода|ماء)\s*[:=]\s*(\d+(?:\.\d+)?)\s*(bbl\/day|m3\/day)/iu)
  if(oil&&water&&/water.?cut|обводн|نسبة الماء/iu.test(text))return {op:"water-cut",oil:{value:Number(oil[1]),unit:oil[2]},water:{value:Number(water[1]),unit:water[2]}}
  return null
}
export function executePetroleumMessage(input:{prompt:string;selectedSkillId?:unknown;attachments?:Attachment[];task?:unknown}): {receipt:PetroleumReceipt;content:string}|null {
  const route=routePetroleum(input.prompt,input.selectedSkillId)
  if(route.engine!=="petroleum")return null
  let task=input.task??taskFromPetroleumPrompt(input.prompt)
  try {
    if(input.attachments?.length) {
      if(input.attachments.length!==1)throw new Error("Upload one production table per calculation; no silent file merging")
      const gasReference= input.prompt.match(/gasReference\s*[:=]\s*([^\n]+)/i)?.[1]?.trim()
      const forecastMonths=Number(input.prompt.match(/(?:forecastMonths|прогноз)\s*[:=]\s*(\d+)/i)?.[1]??12)
      task={op:"production",csv:attachmentCsv(input.attachments[0]),forecastMonths,gasReference}
    }
    if(!task)return null
  }catch(error){task={op:"import-error",error:error instanceof Error?error.message:"FILE_IMPORT_FAILED"}}
  const receipt=runPetroleum(task)
  if((task as {op?:string})?.op==="import-error")receipt.error=String((task as {error:string}).error)
  return {receipt,content:petroleumReport(receipt,petroleumLanguage(input.prompt))}
}
