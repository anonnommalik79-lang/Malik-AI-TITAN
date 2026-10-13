"use client"
import { useState, type KeyboardEvent, type RefObject } from "react"
import { PETROLEUM_SKILL_ID, PETROLEUM_TOKEN, petroleumMention, petroleumSelected } from "@/lib/work/petroleum/router"
export function OilDropIcon() {return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true"><path d="M12 2C9 7 5 10 5 15a7 7 0 0 0 14 0c0-5-4-8-7-13Z" stroke="currentColor" strokeWidth="1.7"/><path d="M8 15c0 2 1 3 3 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>}
export function usePetroleumMention(prompt:string,setPrompt:(text:string)=>void,field:RefObject<HTMLTextAreaElement|null>) {
  const [selection,setSelection]=useState<typeof PETROLEUM_SKILL_ID|undefined>()
  const [dismissed,setDismissed]=useState<string|null>(null)
  const mention=petroleumMention(prompt),open=Boolean(mention)&&dismissed!==prompt
  const skillId=selection&&petroleumSelected(prompt)?selection:undefined
  const choose=()=>{if(!mention)return;setSelection(PETROLEUM_SKILL_ID);setPrompt(prompt.slice(0,mention.start)+PETROLEUM_TOKEN+" "+prompt.slice(mention.end));field.current?.focus()}
  const remove=()=>{setSelection(undefined);setPrompt(prompt.replace(PETROLEUM_TOKEN,"").trimStart());field.current?.focus()}
  const onKeyDown=(event:KeyboardEvent<HTMLTextAreaElement>)=> {
    if(!open||event.nativeEvent.isComposing)return false
    if(event.key==="Escape"){setDismissed(prompt);event.preventDefault();return true}
    if(["Enter","ArrowDown","ArrowUp","Tab"].includes(event.key)){event.preventDefault();if(event.key==="Enter"||event.key==="Tab")choose();return true}
    return false
  }
  return {open,skillId,choose,remove,onKeyDown}
}
export function PetroleumMentionMenu({mention}:{mention:ReturnType<typeof usePetroleumMention>}) {
  return <>
    {mention.skillId?<button type="button" onClick={mention.remove} aria-label="Отключить Malik Oil AI" className="flex items-center gap-2 rounded-full border border-white/20 bg-black px-3 py-1 text-xs text-white"><OilDropIcon/> Malik Oil AI <span aria-hidden="true">×</span></button>:null}
    {mention.open?<div role="listbox" aria-label="Скиллы" className="absolute bottom-full left-0 z-50 mb-2 w-[min(360px,calc(100vw-32px))] bg-black p-1 text-white" style={{backgroundColor:"#000",border:"none",borderRadius:0,boxShadow:"none",backdropFilter:"none"}}>
      <button type="button" role="option" aria-selected="true" onMouseDown={event=>event.preventDefault()} onClick={mention.choose} className="flex w-full items-start gap-3 bg-black p-3 text-left text-white focus-visible:outline focus-visible:outline-1 focus-visible:outline-white" style={{backgroundColor:"#000",border:"none",boxShadow:"none"}}><OilDropIcon/><span><strong className="block text-sm">Malik Oil AI</strong><span className="mt-1 block text-xs text-zinc-400">Профессиональный ИИ для нефти, газа, месторождений и энергетической аналитики.</span></span></button>
    </div>:null}
  </>
}
