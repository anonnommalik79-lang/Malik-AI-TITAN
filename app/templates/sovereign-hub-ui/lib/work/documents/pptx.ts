import type {Slide} from "@/lib/presentations/types"
import {buildPptx} from "@/lib/presentations/pptx"
import {blocksToText,parseMarkdown} from "./markdown"

/** Existing editable slide engine, model-authored sections, no remote images. */
export async function markdownPptx(markdown:string,title:string):Promise<Uint8Array>{
 const sections:Array<{title:string;lines:string[]}>=[]
 for(const block of parseMarkdown(markdown)){
  if(block.type==="heading"&&block.level<=2){sections.push({title:block.inlines.map(i=>i.text).join(""),lines:[]});continue}
  if(!sections.length)sections.push({title,lines:[]})
  const text=blocksToText([block]).trim()
  if(text)sections.at(-1)!.lines.push(...text.split(/\n+/).filter(Boolean))
 }
 if(!sections.length||sections.length>30)throw new Error("Презентация должна содержать от одной до тридцати секций слайдов.")
 const slides:Slide[]=sections.map((section,index)=>{
  if(section.title.length>100||section.lines.length>6||section.lines.some(line=>line.length>220))throw new Error("Слишком плотный слайд: используйте короткие разделы и не более шести пунктов на слайд.")
  const base={id:`slide-${index+1}`,title:section.title,notes:section.lines.join("\n")}
  // The interactive deck normalizer intentionally clips prose to its field
  // limits. Export must preserve source text instead, including one-point
  // slides; this bounded adapter uses the same native renderer directly.
  return section.lines.length?{...base,layout:"bullets",points:section.lines.map(line=>line.length>80?{title:line.slice(0,80),body:line.slice(80)}:{title:line})}:{...base,layout:"title"}
 })
 return buildPptx({title,theme:"obsidian",slides})
}
