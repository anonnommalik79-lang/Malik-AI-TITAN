import type {ConversationIntent} from "./conversation-intent"

export type ConversationIssue="invalid-json"|"unchanged-repair"
export function conversationRepairInstruction(issue:unknown){
 if(issue==="invalid-json")return "OUTPUT VALIDATION FAILED: the last draft was not valid JSON. Answer the exact latest user request as one syntactically valid JSON value only. No fences, prose or trailing commas. Do not claim any external action."
 if(issue==="unchanged-repair")return "OUTPUT VALIDATION FAILED: the draft repeated the rejected prior answer unchanged. Apply the user's requested correction to the supplied source. Preserve unrelated facts; if the error cannot be established, explain exactly what evidence is missing instead of claiming it was fixed."
 return ""
}
export function validateConversationAnswer(intent:ConversationIntent,content:string,source?:string):{content:string;issue?:ConversationIssue}{
 if(intent.requirements.presentation==="json"){
  // Removing a complete outer fence is lossless. Keep number literals intact
  // rather than stringify a parsed object (which could round large integers).
  const candidate=content.trim().replace(/^```(?:json)?\s*\n([\s\S]*?)\n```$/iu,"$1").trim()
  try{JSON.parse(candidate);return{content:candidate}}catch{return{content,issue:"invalid-json"}}
 }
 if(intent.action==="repair"&&source&&source.replace(/\s+/g," ").trim()===content.replace(/\s+/g," ").trim())return{content,issue:"unchanged-repair"}
 return{content}
}
export function conversationValidationFailure(intent:ConversationIntent,issue:ConversationIssue){
 if(intent.requirements.presentation==="json")return JSON.stringify({error:"OUTPUT_VALIDATION_FAILED",reason:issue,completed:false})
 const en=intent.requirements.language==="en"||!/[а-яәіңғүұқөһ]/iu.test(intent.original)
 return en?"The repeated draft did not pass verification. I cannot claim the correction is complete. Specify the incorrect fact or provide the expected source; no previous version was overwritten.":"Повторный ответ не прошёл проверку: модель не внесла подтверждаемого исправления. Исправление не завершено. Укажите ошибочный факт или верный источник; предыдущая версия не перезаписана."
}
