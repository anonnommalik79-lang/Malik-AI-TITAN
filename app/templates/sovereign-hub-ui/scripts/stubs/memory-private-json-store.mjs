// Stand-in for lib/server/private-json-store: an in-memory bucket with ETags,
// so compare-and-swap paths run for real. A test can switch it on and inject
// write conflicts (another instance writing first).
const objects = new Map()
let version = 0
export const bucket = { objects, conflictsToInject: 0, writes: 0 }
globalThis.__malikMemoryBucket = bucket
export function privateJsonStoreConfigured() { return globalThis.__malikStoreConfigured === true }
export async function readPrivateJsonVersioned(key) {
  const entry = objects.get(key)
  return entry ? { value: entry.value === null ? null : structuredClone(entry.value), etag: entry.etag } : { value: null, etag: null }
}
export async function readPrivateJson(key) { return (await readPrivateJsonVersioned(key)).value }
export async function writePrivateJsonConditional(key, value, previousEtag) {
  bucket.writes += 1
  const entry = objects.get(key)
  if (bucket.conflictsToInject > 0) {
    bucket.conflictsToInject -= 1
    // Someone else wrote in between: bump the stored version.
    objects.set(key, { value: entry ? entry.value : null, etag: `"v${++version}"` })
    return { stored: false, conflict: true }
  }
  if ((entry?.etag ?? null) !== (previousEtag ?? null)) return { stored: false, conflict: true }
  objects.set(key, { value: structuredClone(value), etag: `"v${++version}"` })
  return { stored: true, conflict: false }
}
export async function writePrivateJson(key, value) { objects.set(key, { value, etag: `"v${++version}"` }); return true }
export async function deletePrivateJson(key) { objects.delete(key); return true }
