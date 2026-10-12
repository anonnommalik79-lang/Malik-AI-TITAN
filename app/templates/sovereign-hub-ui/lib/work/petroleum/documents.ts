import { createHash } from "node:crypto"
import { execFile } from "node:child_process"
import { inflateRawSync } from "node:zlib"
import { crc32 } from "../documents/zip"
import { runPetroleum } from "./engine"
import { routePetroleum } from "./router"
import { petroleumLanguage, petroleumReport } from "./report"
const LIMIT=4*1024*1024, TEXT_LIMIT=1_000_000
type DocumentAttachment={name?:string;mime?:string;base64?:string;size?:number}
function xmlText(xml:string) {
  return [...xml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map(m=>m[1].replace(/&#x([0-9a-f]+);/gi,(_,s)=>String.fromCodePoint(parseInt(s,16))).replace(/&#(\d+);/g,(_,s)=>String.fromCodePoint(Number(s))).replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&')).join('')
}
/** Bounded OOXML part reader; no extraction to disk, relationships, macros or external entities executed. */
export function readDocx(buffer:Buffer) {
  if(buffer.length<22||buffer.length>LIMIT||buffer.readUInt32LE(0)!==0x04034b50)throw new Error("DOCX_SIGNATURE_OR_SIZE")
  let end=-1
  for(let i=buffer.length-22;i>=Math.max(0,buffer.length-65557);i--)if(buffer.readUInt32LE(i)===0x06054b50){end=i;break}
  if(end<0)throw new Error("DOCX_BROKEN_ZIP")
  const count=buffer.readUInt16LE(end+10);let offset=buffer.readUInt32LE(end+16),xml="",total=0
  if(count>2000)throw new Error("DOCX_TOO_MANY_PARTS")
  for(let i=0;i<count;i++) {
    if(offset+46>buffer.length||buffer.readUInt32LE(offset)!==0x02014b50)throw new Error("DOCX_CENTRAL_DIRECTORY")
    const flags=buffer.readUInt16LE(offset+8),method=buffer.readUInt16LE(offset+10),crc=buffer.readUInt32LE(offset+16),compressed=buffer.readUInt32LE(offset+20),size=buffer.readUInt32LE(offset+24),nameLength=buffer.readUInt16LE(offset+28),extra=buffer.readUInt16LE(offset+30),comment=buffer.readUInt16LE(offset+32),local=buffer.readUInt32LE(offset+42)
    total+=size;if(total>16*1024*1024||size>8*1024*1024||flags&1)throw new Error("DOCX_EXPANSION_OR_ENCRYPTION")
    if(offset+46+nameLength+extra+comment>buffer.length)throw new Error("DOCX_TRUNCATED_DIRECTORY")
    const name=buffer.subarray(offset+46,offset+46+nameLength).toString('utf8');offset+=46+nameLength+extra+comment
    if(name!=="word/document.xml")continue
    if(xml||local+30>buffer.length||buffer.readUInt32LE(local)!==0x04034b50)throw new Error("DOCX_DUPLICATE_OR_BAD_PART")
    const start=local+30+buffer.readUInt16LE(local+26)+buffer.readUInt16LE(local+28)
    if(start+compressed>buffer.length)throw new Error("DOCX_TRUNCATED_PART")
    const bytes=buffer.subarray(start,start+compressed)
    const data=method===0?bytes:method===8?inflateRawSync(bytes,{maxOutputLength:8*1024*1024}):null
    if(!data||data.length!==size||crc32(data)!==crc)throw new Error("DOCX_COMPRESSION_OR_SIZE_OR_CRC_MISMATCH")
    xml=new TextDecoder('utf-8',{fatal:true}).decode(data)
  }
  if(!xml||/<!DOCTYPE|<!ENTITY/i.test(xml))throw new Error("DOCX_MISSING_OR_UNSUPPORTED_XML")
  const paragraphs=[...xml.matchAll(/<w:p(?:\s[^>]*)?>([\s\S]*?)<\/w:p>/g)].map(m=>xmlText(m[1]))
  const text=paragraphs.join('\n');if(!text.trim()||text.length>TEXT_LIMIT)throw new Error("DOCX_EMPTY_OR_TEXT_TOO_LARGE")
  const tables=[...xml.matchAll(/<w:tbl(?:\s[^>]*)?>([\s\S]*?)<\/w:tbl>/g)].map(table=> {
    if(/w:gridSpan|w:vMerge|<w:tbl\b/.test(table[1]))return null
    return [...table[1].matchAll(/<w:tr(?:\s[^>]*)?>([\s\S]*?)<\/w:tr>/g)].map(row=>[...row[1].matchAll(/<w:tc(?:\s[^>]*)?>([\s\S]*?)<\/w:tc>/g)].map(cell=>xmlText(cell[1])))
  }).filter((table):table is string[][]=>Boolean(table))
  return {text,tables,method:"Bounded OOXML document.xml text/table extraction 1.0; no field codes or external relationships evaluated"}
}
export function pdfTextAvailable():Promise<boolean> {
  return Promise.all(["pdftotext","pdfinfo"].map(binary=>new Promise<boolean>(resolve=>execFile(binary,["-v"],{timeout:1500,maxBuffer:4096},error=>resolve(!error))))).then(results=>results.every(Boolean))
}
/** Whitelisted binary, fixed arguments and stdin bytes. A missing binary is a truthful capability error. */
export async function readPdfText(buffer:Buffer):Promise<{text:string;tables:string[][][];method:string}> {
  if(buffer.length>LIMIT||!buffer.subarray(0,5).equals(Buffer.from('%PDF-')))throw new Error("PDF_SIGNATURE_OR_SIZE")
  const pages=await new Promise<number>((resolve,reject)=>{
    const child=execFile("pdfinfo",["-"],{timeout:2000,maxBuffer:16384},(error,stdout)=>{
      if(error){reject(new Error((error as NodeJS.ErrnoException).code==="ENOENT"?"PDF_EXTRACTOR_UNAVAILABLE: local pdfinfo/pdftotext required":"PDF_METADATA_FAILED_OR_ENCRYPTED"));return}
      const pages=Number(stdout.toString().match(/^Pages:\s*(\d+)/m)?.[1])
      if(!Number.isInteger(pages)||pages<1||pages>100||/^Encrypted:\s*yes/im.test(stdout.toString()))reject(new Error("PDF_PAGE_LIMIT_OR_ENCRYPTION: 1..100 unencrypted pages required; no silent truncation"));else resolve(pages)
    });child.stdin?.on('error',()=>undefined);child.stdin?.end(buffer)
  })
  return new Promise((resolve,reject)=> {
    const child=execFile("pdftotext",["-layout","-f","1","-l","100","-nopgbrk","-enc","UTF-8","-","-"],{timeout:5000,maxBuffer:4*1024*1024},(error,stdout)=> {
      if(error){reject(new Error((error as NodeJS.ErrnoException).code==="ENOENT"?"PDF_EXTRACTOR_UNAVAILABLE: local pdftotext required; no cloud fallback":"PDF_EXTRACTION_FAILED_OR_TIMEOUT"));return}
      const text=stdout.toString().replace(/\0/g,'')
      if(!text.trim()||text.length>TEXT_LIMIT){reject(new Error("PDF_NO_TEXT_OR_TOO_LARGE: scanned PDF/OCR not supported"));return}
      resolve({text,tables:[],method:`Local Poppler pdftotext -layout; all ${pages} pages extracted; no OCR or geometric table inference`})
    })
    child.stdin?.on('error',()=>undefined);child.stdin?.end(buffer)
  })
}
export function productionTableCsv(tables:string[][][]) {
  const compatible=tables.filter(table=>{const header=table[0]?.map(c=>c.trim().toLowerCase())||[];return table.length>=2&&header.includes('well_id')&&header.includes('date')&&header.some(c=>/^oil_(?:bbl|m3)_day$/.test(c))})
  if(compatible.length!==1)return null
  if(compatible[0].length>20001||compatible[0].some(row=>row.length>30))throw new Error("DOCUMENT_TABLE_TOO_LARGE")
  return compatible[0].map(row=>row.map(cell=>'"'+cell.replace(/"/g,'""')+'"').join(',')).join('\n')
}
export async function executePetroleumDocument(input:{prompt:string;selectedSkillId?:unknown;attachments?:DocumentAttachment[]}) {
  if(routePetroleum(input.prompt,input.selectedSkillId).engine!=="petroleum"||!Array.isArray(input.attachments)||!input.attachments.some(f=>/\.(?:pdf|docx)$/i.test(f.name||'')))return null
  let task:unknown
  try {
    if(input.attachments.length!==1)throw new Error("Upload one document per analysis; files are never silently merged")
    const file=input.attachments[0],type=file.name?.toLowerCase().endsWith('.pdf')?'pdf':'docx'
    if(file.size&&file.size>LIMIT||!file.base64||file.base64.length>Math.ceil(LIMIT*4/3)+4||!/^[A-Za-z0-9+/]*={0,2}$/.test(file.base64))throw new Error("DOCUMENT_BYTES_OR_SIZE")
    const mime=type==='pdf'?'application/pdf':'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    if(file.mime&&file.mime.split(';')[0]!==mime&&file.mime!=='application/octet-stream')throw new Error("DOCUMENT_MIME_MISMATCH")
    const buffer=Buffer.from(file.base64,'base64'),sourceHash=createHash('sha256').update(buffer).digest('hex')
    const document=type==='pdf'?await readPdfText(buffer):readDocx(buffer)
    const csv=productionTableCsv(document.tables)
    if(csv)task={op:'production',csv,forecastMonths:12,gasReference:input.prompt.match(/gasReference\s*[:=]\s*([^\n]+)/i)?.[1]?.trim(),sourceDocument:{type,sha256:sourceHash,method:document.method}}
    else task={op:'document-audit',text:document.text,sourceType:type,sourceHash,extractionMethod:document.method}
  }catch(error){task={op:'import-error',error:error instanceof Error?error.message:'DOCUMENT_FAILED'}}
  const receipt=runPetroleum(task)
  if((task as {op?:string})?.op==='import-error')receipt.error=String((task as {error:string}).error)
  return {receipt,content:petroleumReport(receipt,petroleumLanguage(input.prompt))}
}
