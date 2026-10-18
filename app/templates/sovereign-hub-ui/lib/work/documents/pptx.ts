import type {Slide} from "@/lib/presentations/types"
import {buildPptx} from "@/lib/presentations/pptx"
import {blocksToText,parseMarkdown} from "./markdown"
import {parseCell} from "./xlsx"
import type {DocumentAsset} from "./assets"

/** Existing editable slide engine, model-authored sections, no remote images. */
export async function markdownPptx(markdown:string,title:string,assets:DocumentAsset[]=[]):Promise<Uint8Array>{
 const sections:Array<{title:string;lines:string[];data?:Array<{label:string;value:number}>;unit?:string}>=[]
 for(const block of parseMarkdown(markdown.replace(/<!--[\s\S]*?-->/g,""))){
  if(block.type==="heading"&&block.level<=2){sections.push({title:block.inlines.map(i=>i.text).join(""),lines:[]});continue}
  if(!sections.length)sections.push({title,lines:[]})
  if(block.type==="table"&&block.header.length===2&&block.rows.length>=2&&block.rows.length<=30){
   const data=block.rows.map(row=>({label:row[0].map(i=>i.text).join(""),cell:parseCell(row[1].map(i=>i.text).join(""))}))
   if(data.every(row=>row.cell.kind==="number")&&!sections.at(-1)!.data){
    sections.at(-1)!.data=data.map(row=>({label:row.label,value:row.cell.kind==="number"?row.cell.value:0}))
    sections.at(-1)!.unit=block.header[1].map(i=>i.text).join("");continue
   }
  }
  const text=blocksToText([block]).trim()
  if(text)sections.at(-1)!.lines.push(...text.split(/\n+/).filter(Boolean))
 }
 if(!sections.length||sections.length>30)throw new Error("Презентация должна содержать от одной до тридцати секций слайдов.")
 const slides:Slide[]=sections.map((section,index)=>{
  if(section.title.length>100||section.lines.length>6||section.lines.some(line=>line.length>220))throw new Error("Слишком плотный слайд: используйте короткие разделы и не более шести пунктов на слайд.")
  const base={id:`slide-${index+1}`,title:section.title,notes:section.lines.join("\n")}
  if(section.data)return{...base,layout:"chart",data:section.data,unit:section.unit,takeaway:section.lines.join(" ")}
  const image=assets.find(asset=>asset.slideIndex===index)
  if(image)return{...base,notes:base.notes+"\n"+image.credit,layout:"image-text",points:section.lines,imageSide:"right",imageCredit:image.credit}
  // The interactive deck normalizer intentionally clips prose to its field
  // limits. Export must preserve source text instead, including one-point
  // slides; this bounded adapter uses the same native renderer directly.
  return section.lines.length?{...base,layout:"bullets",points:section.lines.map(line=>line.length>80?{title:line.slice(0,80),body:line.slice(80)}:{title:line})}:{...base,layout:"title"}
 })
 const images=new Map(assets.map(asset=>[`slide-${asset.slideIndex+1}`,asset.dataUrl]))
 return buildPptx({title,theme:"obsidian",slides},images)
}
