import {createHash} from "node:crypto"
import {exportDocument} from "@/lib/work/documents/export"
import {DOCUMENT_FORMATS,type DocumentFormat} from "@/lib/work/documents/formats"
import {createProject,getArtifact,putArtifact,storeIsDurable} from "@/lib/os/store"
import type {Artifact} from "@/lib/os/types"
import type {ConversationIntent} from "@/lib/ai/conversation-intent"
import type {RequestEntitlement} from "@/lib/server/request-entitlement"
import type {ExecutionReporter} from "@/lib/ai/chat-execution"

/** Only server session ownership authorizes an artifact read, never its ID in
 * messages, a model's text, client metadata or an email in the request. */
export async function conversationSource(intent:ConversationIntent,owner?:RequestEntitlement):Promise<{content:string;artifact?:Artifact}|null>{
 if(!intent.source)return null
 if(intent.source.tooLarge)throw new Error("SOURCE_TOO_LARGE")
 if(intent.source.artifactId){
  const artifact=owner?.authenticated?await getArtifact(owner.userId,intent.source.artifactId):null
  if(!artifact?.content)throw new Error("SOURCE_NOT_AVAILABLE")
  return{content:artifact.content,artifact}
 }
 return{content:intent.source.content}
}

function language(intent:ConversationIntent){return intent.requirements.language==="en"||!/[а-яәіңғүұқөһ]/iu.test(intent.original)?"en":"ru"}
export function deliveryProblem(intent:ConversationIntent,code:string){
 const en=language(intent)==="en"
 if(code==="SOURCE_NOT_AVAILABLE")return en?"The earlier file is unavailable in this account or expired. Upload the source again; no file was created.":"Предыдущий файл недоступен в этом аккаунте или утрачен после перезапуска. Пришлите исходник снова. Новый файл не создан."
 if(code==="SIGN_IN_REQUIRED")return en?"Sign in to save a downloadable chat file. The answer's existing download menu can still export supplied text; no saved file was created.":"Войдите, чтобы сохранить скачиваемый файл чата. Текст можно экспортировать через существующее меню скачивания ответа; сохранённый файл не создан."
 if(code==="MISSING_SOURCE")return en?"Send the text or file to convert, or specify which earlier result you mean. No file was created.":"Пришлите текст или файл для преобразования либо укажите предыдущий результат. Файл пока не создан."
 if(code==="SOURCE_TOO_LARGE")return en?"The source exceeds the supported export size. It was not silently truncated; no file was created.":"Исходник превышает поддерживаемый размер экспорта. Содержимое не обрезано; файл не создан."
 return en?"The requested file could not be validated. No download is claimed. The source text is kept; choose another format or correct its structure.":"Запрошенный файл не прошёл создание или проверку. Ссылку на несуществующий файл не выдаю. Исходный текст сохранён: выберите другой формат или исправьте структуру."
}

export async function deliverConversationDocument(input:{owner?:RequestEntitlement;intent:ConversationIntent;markdown:string;previous?:Artifact;signal?:AbortSignal;activity?:ExecutionReporter}){
 const {owner,intent,markdown,previous,signal,activity}=input
 signal?.throwIfAborted()
 if(!owner?.authenticated)return{ok:false as const,content:deliveryProblem(intent,"SIGN_IN_REQUIRED")}
 const format=intent.requirements.format
 if(!format||!DOCUMENT_FORMATS.includes(format as DocumentFormat))return{ok:false as const,content:deliveryProblem(intent,"FORMAT_UNSUPPORTED")}
 if(!markdown.trim()||markdown.length>400_000||Buffer.byteLength(markdown)>400*1024)return{ok:false as const,content:deliveryProblem(intent,markdown?"SOURCE_TOO_LARGE":"MISSING_SOURCE")}
 const title=(markdown.match(/^#{1,2}\s+(.+)$/m)?.[1]||previous?.title||"Malik AI document").replace(/[\r\n]/g," ").slice(0,100)
 const step=activity?.start(`Создаю ${format.toUpperCase()}`,"file","document.export",{format})
 try{
  const file=await exportDocument({format:format as DocumentFormat,title,markdown,allowFormulas:intent.requirements.formulas})
  signal?.throwIfAborted()
  const signature=Buffer.from(file.bytes.subarray(0,8)).toString("latin1")
  if(file.bytes.length<1||format==="pdf"&&!signature.startsWith("%PDF-")||["docx","xlsx","pptx","zip"].includes(format)&&!signature.startsWith("PK"))throw new Error("EXPORT_VERIFICATION_FAILED")
  const durable=await storeIsDurable()
  const project=previous?{id:previous.projectId}:await createProject(owner.userId,{title,goal:"Chat document delivery"})
  signal?.throwIfAborted()
  // Download re-renders this immutable source. ZIP/PDF timestamps may differ;
  // the public hash therefore binds the source, not a future byte-for-byte file.
  const hash=createHash("sha256").update(markdown).digest("hex")
  const artifact=await putArtifact(owner.userId,{projectId:project.id,kind:"document",title,sourceTool:"document.write",content:markdown,mime:"text/markdown",version:(previous?.version||0)+1,
   links:previous?[{relation:intent.action==="export"?"derived-from":"revision-of",artifactId:previous.id}]:[],
   metadata:{role:"chat-document",requestedFormat:format,safeFormulas:intent.requirements.formulas===true,exportProbe:{sourceSha256:hash,bytes:file.bytes.length,mime:file.mime,filename:file.filename},testsExecuted:false,storage:durable?"private-durable":"runtime-memory"},
  })
  signal?.throwIfAborted()
  activity?.finish(step,{format,bytes:file.bytes.length,sha256:hash,artifactId:artifact.id,durable},"completed")
  const href=`/api/os/artifacts/${artifact.id}/export?format=${format}`
  const note=durable?"":"\n\n"+(language(intent)==="en"?"Stored in server memory only; unavailable after a restart. Download it now.":"Сохранено только в памяти сервера. После перезапуска ссылка может перестать работать — скачайте файл сейчас.")
  return{ok:true as const,artifact,content:`[${file.filename.replace(/[[\]\r\n]/g," ")}](${href})\n\n${language(intent)==="en"?"Export validated; download is rendered from the saved source. Source SHA-256:":"Экспорт проверен; скачивание формируется из сохранённого исходника. SHA-256 текста:"} \`${hash}\``+note}
 }catch{
  signal?.throwIfAborted();activity?.finish(step,undefined,"failed","DOCUMENT_EXPORT_FAILED")
  return{ok:false as const,content:deliveryProblem(intent,"EXPORT_FAILED")}
 }
}
