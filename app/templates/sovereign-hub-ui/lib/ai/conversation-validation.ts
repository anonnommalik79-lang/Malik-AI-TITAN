import { instructionText, type ConversationIntent } from "./conversation-intent"

export type ConversationIssue="invalid-json"|"unchanged-repair"|"unsupported-action-claim"
/** Only status/execution requests need this buffered gate; normal chat streams. */
export function needsActionClaimValidation(prompt:string){
 const text=instructionText(prompt)
 return /^(?:(?:а|и|пожалуйста|please)[,\s]+)*(?:запусти|выполни|отправь|задеплой|закоммить|запушь|run\b|execute\b|deploy\b|send\b|commit\b|push\b|upload\b|іске\s+қос|жібер)/iu.test(text)
  || /^(?:ты|вы|did\s+you|have\s+you|сен|сіз).{0,80}(?:запус|выполн|отправ|сохран|депло|коммит|пуш|\brun\b|execut|sent\b|deploy|commit|push|upload|іске\s+қос|орында|жібер)/iu.test(text)
}
function unsupportedActionClaim(text:string){
 const execution=/(?<!\p{L})(?:я\s+(?:уже\s+)?(?:запустил|выполнил)\s+(?:все\s+)?(?:тест\p{L}*|код|скрипт\p{L}*|команд\p{L}*|сервер)|i\s+(?:have\s+)?(?:run|ran|executed)\s+(?:(?:the|all|your|unit)\s+){0,3}(?:tests?|commands?|scripts?|code|server|program|suite)\b|(?:мен\s+)?(?:тест\p{L}*|код\p{L}*|команда\p{L}*)\s+(?:іске\s+қостым|орындадым))(?!\p{L})/iu
 const write=/(?<!\p{L})(?:я\s+(?:уже\s+)?(?:задеплоил|закоммитил|запушил)|i\s+(?:have\s+)?(?:deployed|committed|pushed|uploaded)\b|я\s+отправил\s+(?:письмо|email|плат[её]ж)|i\s+(?:have\s+)?sent\s+(?:(?:the|your|an?)\s+)?(?:email|payment)\b|мен\s+.{0,20}(?:хатты|төлемді)\s+жібердім)(?!\p{L})/iu
 return execution.test(text)||write.test(text)
}
export function conversationRepairInstruction(issue:unknown){
 if(typeof issue==="string"&&/^(?:XLSX_|PPTX_|FORMULA_|SPREADSHEET_|NATIVE_|DOCUMENT_EXPORT_FAILED)[A-Z_]*$/.test(issue))return `NATIVE OUTPUT VALIDATION FAILED (${issue}). Rewrite the complete document for the exact original request. Obey the execution contract's format, forecast horizon, slide count, formulas and charts. Keep assumptions explicit; do not invent source data. For XLSX provide Markdown tables with local numeric formulas and a category column followed by numeric/formula series; for PPTX use exactly the requested number of short heading sections and a two-column numeric table for a native chart. Do not claim a file exists or tools ran. This is the only repair attempt.`
 if(issue==="invalid-json")return "OUTPUT VALIDATION FAILED: the last draft was not valid JSON. Answer the exact latest user request as one syntactically valid JSON value only. No fences, prose or trailing commas. Do not claim any external action."
 if(issue==="unchanged-repair")return "OUTPUT VALIDATION FAILED: the draft repeated the rejected prior answer unchanged. Apply the user's requested correction to the supplied source. Preserve unrelated facts; if the error cannot be established, explain exactly what evidence is missing instead of claiming it was fixed."
 if(issue==="unsupported-action-claim")return "OUTPUT VALIDATION FAILED: no server tool receipt establishes the claimed command execution, send or external write. Correct the first-person completion claim; explain what can actually be checked from the supplied data and what has not been performed. Do not replay a tool or invent a receipt. This is the only repair attempt."
 return ""
}
export function validateConversationAnswer(intent:ConversationIntent,content:string,source?:string):{content:string;issue?:ConversationIssue}{
 if(intent.requirements.presentation==="json"){
  // Removing a complete outer fence is lossless. Keep number literals intact
  // rather than stringify a parsed object (which could round large integers).
  const candidate=content.trim().replace(/^```(?:json)?\s*\n([\s\S]*?)\n```$/iu,"$1").trim()
  try{JSON.parse(candidate);content=candidate}catch{return{content,issue:"invalid-json"}}
 }
 if(intent.action==="repair"&&source&&source.replace(/\s+/g," ").trim()===content.replace(/\s+/g," ").trim())return{content,issue:"unchanged-repair"}
 if(needsActionClaimValidation(intent.original)&&unsupportedActionClaim(intent.requirements.presentation==="json"?content:instructionText(content)))return{content,issue:"unsupported-action-claim"}
 return{content}
}
export function conversationValidationFailure(intent:ConversationIntent,issue:ConversationIssue){
 if(intent.requirements.presentation==="json")return JSON.stringify({error:"OUTPUT_VALIDATION_FAILED",reason:issue,completed:false})
 const kk=intent.requirements.language==="kk"||!intent.requirements.language&&/[әіңғүұқөһ]/iu.test(intent.original)
 const en=intent.requirements.language==="en"||!/[а-яәіңғүұқөһ]/iu.test(intent.original)
 if(issue==="unsupported-action-claim")return kk?"Бұл әрекеттің орындалғанын растай алмаймын: құралдан орындалу туралы растау алынбады.":en?"I cannot confirm that action was performed: no execution receipt was returned.":"Не могу подтвердить выполнение этого действия: от инструмента не получено подтверждение выполнения."
 if(kk)return "Қайта берілген жауап тексеруден өтпеді. Түзету аяқталды деп айта алмаймын; қате фактіні немесе сенімді дереккөзді көрсетіңіз."
 return en?"The repeated draft did not pass verification. I cannot claim the correction is complete. Specify the incorrect fact or provide the expected source; no previous version was overwritten.":"Повторный ответ не прошёл проверку: модель не внесла подтверждаемого исправления. Исправление не завершено. Укажите ошибочный факт или верный источник; предыдущая версия не перезаписана."
}
