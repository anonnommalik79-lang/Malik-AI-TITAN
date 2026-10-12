import { z } from "zod"
import { osOwner } from "@/lib/os/http"
import { readJsonBodyLimited, RequestSafetyError } from "@/lib/server/request-safety"
import { takeRequestFrequency } from "@/lib/server/request-frequency"
import { recordWorkActivity } from "@/lib/work/activity-log"
import { fieldTaskSchema } from "@/lib/work/petroleum/field-schema"
import { readFieldSnapshot, saveFieldSnapshot, removeFieldSnapshot } from "@/lib/work/petroleum/snapshots"

export const runtime="nodejs"
export const dynamic="force-dynamic"
const headers={"cache-control":"private, no-store"}
const schema=z.object({task:fieldTaskSchema,authorizedImport:z.literal(true),consentToConfiguredPrivateStorage:z.literal(true),retentionDays:z.number().int().min(1).max(30).default(7)}).strict()
async function identity(request:Request) {
  const owner=await osOwner(request)
  if (!owner.authenticated) return {error:Response.json({code:"AUTH_REQUIRED"},{status:401,headers})}
  if (!takeRequestFrequency("petroleum-snapshots",owner.userId,12)) return {error:Response.json({code:"RATE_LIMIT"},{status:429,headers})}
  return {id:owner.userId}
}
function failure(error:unknown) {
  const code=error instanceof Error ? error.message : "SNAPSHOT_FAILED"
  const allowed=/^(?:PRIVATE_STORAGE_|INVALID_SNAPSHOT_ID|SNAPSHOT_|FIELD_FAILED|CANCELLED|TIME-LIMITED)/.test(code)
  return Response.json({code:allowed?code:"SNAPSHOT_FAILED",error:"Private snapshot operation failed; no alternate cloud or in-memory storage was used."},{status:error instanceof RequestSafetyError?error.status:code==="INVALID_SNAPSHOT_ID"?400:503,headers})
}
export async function POST(request:Request) {
  const started=Date.now()
  try {
    const owner=await identity(request); if (owner.error) return owner.error
    const parsed=schema.safeParse(await readJsonBodyLimited(request,5*1024*1024))
    if (!parsed.success) return Response.json({code:"INVALID_INPUT_OR_MISSING_CONSENT"},{status:400,headers})
    const saved=await saveFieldSnapshot(owner.id!,parsed.data.task,parsed.data.retentionDays,request.signal)
    await recordWorkActivity(owner.id!,{action:"petroleum.snapshot.create",ok:true,durationMs:Date.now()-started,subject:saved.snapshot.id})
    return Response.json({ok:true,id:saved.snapshot.id,revision:saved.snapshot.result.revision,expiresAt:saved.snapshot.expiresAt,reused:saved.reused,durable:true,storage:"configured-private-object-store"},{status:saved.reused?200:201,headers})
  } catch(error) { return failure(error) }
}
export async function GET(request:Request) {
  try {
    const owner=await identity(request); if (owner.error) return owner.error
    const snapshot=await readFieldSnapshot(owner.id!,new URL(request.url).searchParams.get("id") || "")
    return Response.json(snapshot?{ok:true,snapshot}:{ok:false,code:"NOT_FOUND"},{status:snapshot?200:404,headers})
  } catch(error) { return failure(error) }
}
export async function DELETE(request:Request) {
  const started=Date.now()
  try {
    const owner=await identity(request); if (owner.error) return owner.error
    const id=new URL(request.url).searchParams.get("id") || ""
    if (!await removeFieldSnapshot(owner.id!,id)) throw new Error("PRIVATE_STORAGE_DELETE_FAILED")
    await recordWorkActivity(owner.id!,{action:"petroleum.snapshot.delete",ok:true,durationMs:Date.now()-started,subject:id})
    return Response.json({ok:true},{headers})
  } catch(error) { return failure(error) }
}
