import "server-only"
import { createHash } from "node:crypto"
import { privateJsonStoreConfigured, readPrivateJsonVersioned, writePrivateJsonConditional, deletePrivateJson } from "../../server/private-json-store"
import { fieldTaskSchema, type FieldTask } from "./field-schema"
import { FIELD_VERSION, fieldRevision, type FieldResult } from "./field"
import { runPetroleumAsync } from "./engine"

export type FieldSnapshot = { schemaVersion:1; id:string; ownerHash:string; createdAt:string; expiresAt:string; authorizedImport:true; task:FieldTask; result:FieldResult; resultHash:string }
const digest=(v:string)=>createHash("sha256").update(v).digest("hex")
const ownerHash=(id:string)=>{ if (!id.trim()) throw new Error("AUTH_REQUIRED"); return digest(id) }
function key(ownerId:string,id:string) {
  if (!/^[a-f0-9]{64}$/.test(id)) throw new Error("INVALID_SNAPSHOT_ID")
  return `petroleum/snapshots/v1/${ownerHash(ownerId)}/${id}.json`
}
export async function saveFieldSnapshot(ownerId:string,raw:unknown,retentionDays:number,signal?:AbortSignal) {
  if (!privateJsonStoreConfigured()) throw new Error("PRIVATE_STORAGE_NOT_CONFIGURED")
  if (!Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > 30) throw new Error("INVALID_RETENTION")
  const task=fieldTaskSchema.parse(raw), id=fieldRevision({algorithm:FIELD_VERSION,task})
  const previous=await readFieldSnapshot(ownerId,id)
  if (previous) return {snapshot:previous,reused:true}
  const receipt=await runPetroleumAsync(task,{signal})
  if (!receipt.ok || !receipt.result) throw new Error(receipt.error || "FIELD_FAILED")
  if (signal?.aborted) throw new Error("CANCELLED")
  const result=receipt.result as FieldResult, now=Date.now()
  const snapshot:FieldSnapshot={schemaVersion:1,id,ownerHash:ownerHash(ownerId),createdAt:new Date(now).toISOString(),expiresAt:new Date(now+retentionDays*86400000).toISOString(),authorizedImport:true,task,result,resultHash:fieldRevision(result)}
  if (Buffer.byteLength(JSON.stringify(snapshot),"utf8") > 7*1024*1024) throw new Error("SNAPSHOT_TOO_LARGE_USE_DOWNLOAD")
  const target=key(ownerId,id), written=await writePrivateJsonConditional(target,snapshot,null)
  if (!written.stored) {
    if (!written.conflict) throw new Error("PRIVATE_STORAGE_WRITE_FAILED")
    const existing=await readFieldSnapshot(ownerId,id)
    if (!existing) throw new Error("SNAPSHOT_EXPIRED_OR_UNAVAILABLE")
    return {snapshot:existing,reused:true}
  }
  return {snapshot,reused:false}
}
export async function readFieldSnapshot(ownerId:string,id:string):Promise<FieldSnapshot|null> {
  if (!privateJsonStoreConfigured()) throw new Error("PRIVATE_STORAGE_NOT_CONFIGURED")
  const target=key(ownerId,id), {value}=await readPrivateJsonVersioned<FieldSnapshot>(target)
  if (!value) return null
  if (value.schemaVersion!==1 || value.id!==id || value.ownerHash!==ownerHash(ownerId) || !Number.isFinite(Date.parse(value.expiresAt))) throw new Error("INVALID_STORED_SNAPSHOT")
  if (Date.parse(value.expiresAt)<=Date.now()) { await deletePrivateJson(target); return null }
  // Integrity and versioned reproduction, not proof of the input's calibration.
  if (fieldRevision({algorithm:value.result.version,task:value.task})!==id || fieldRevision(value.task)!==value.result.revision || fieldRevision(value.result)!==value.resultHash) throw new Error("SNAPSHOT_INTEGRITY_FAILED")
  return value
}
export async function removeFieldSnapshot(ownerId:string,id:string) {
  if (!privateJsonStoreConfigured()) throw new Error("PRIVATE_STORAGE_NOT_CONFIGURED")
  return deletePrivateJson(key(ownerId,id))
}
