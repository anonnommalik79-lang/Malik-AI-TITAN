const DATABASE_NAME = "malik-ai-generated-media"
const DATABASE_VERSION = 2
const STORE_NAME = "images"
const URL_PREFIX = "malik-image://"

const MAX_LOCAL_IMAGE_BYTES = 64 * 1024 * 1024
const MAX_ACCOUNT_IMAGES = 160
const MAX_ACCOUNT_CACHE_BYTES = 768 * 1024 * 1024

type StoredImage = {
  id: string
  blob?: Blob
  dataUrl?: string
  createdAt: number
  bytes?: number
  account?: string
}

let currentAccountScope = "guest"

function hash(value: string) {
  let h = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    h ^= value.charCodeAt(index)
    h = Math.imul(h, 16777619)
  }
  return Math.abs(h >>> 0).toString(36)
}

function normalizeAccountScope(value: string) {
  const clean = String(value || "guest").trim().toLowerCase() || "guest"
  return `u:${hash(clean)}`
}

export function setGeneratedImageAccountScope(accountId: string) {
  currentAccountScope = normalizeAccountScope(accountId)
}

export async function requestPersistentGeneratedImageStorage() {
  try {
    if (typeof navigator === "undefined" || !navigator.storage?.persist) return false
    return Boolean(await navigator.storage.persist())
  } catch {
    return false
  }
}

function scopedKey(value: string) {
  return `acct:${currentAccountScope}:${value}`
}

function storedUrlForKey(key: string) {
  return `${URL_PREFIX}${encodeURIComponent(key)}`
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is unavailable"))
      return
    }

    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "id" })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error("Could not open generated image storage"))
  })
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error || new Error("Generated image storage failed"))
    transaction.onabort = () => reject(transaction.error || new Error("Generated image storage was aborted"))
  })
}

function estimateBytes(entry: StoredImage) {
  if (typeof entry.bytes === "number" && Number.isFinite(entry.bytes)) return Math.max(0, entry.bytes)
  if (entry.blob) return entry.blob.size
  return entry.dataUrl ? Math.ceil(entry.dataUrl.length * 0.75) : 0
}

async function readEntry(key: string): Promise<StoredImage | undefined> {
  const database = await openDatabase()
  try {
    return await new Promise<StoredImage | undefined>((resolve, reject) => {
      const request = database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(key)
      request.onsuccess = () => resolve(request.result as StoredImage | undefined)
      request.onerror = () => reject(request.error || new Error("Could not read generated image"))
    })
  } finally {
    database.close()
  }
}

async function writeEntry(entry: StoredImage) {
  const database = await openDatabase()
  try {
    const transaction = database.transaction(STORE_NAME, "readwrite")
    transaction.objectStore(STORE_NAME).put(entry)
    await transactionDone(transaction)
  } finally {
    database.close()
  }
}

async function pruneCurrentAccount() {
  try {
    const database = await openDatabase()
    const entries = await new Promise<StoredImage[]>((resolve, reject) => {
      const request = database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).getAll()
      request.onsuccess = () => resolve((request.result || []) as StoredImage[])
      request.onerror = () => reject(request.error || new Error("Could not inspect generated image storage"))
    })

    const prefix = `acct:${currentAccountScope}:`
    const scoped = entries
      .filter((entry) => String(entry?.id || "").startsWith(prefix))
      .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))

    let used = 0
    const keep = new Set<string>()
    for (const entry of scoped) {
      const bytes = estimateBytes(entry)
      if (keep.size >= MAX_ACCOUNT_IMAGES || used + bytes > MAX_ACCOUNT_CACHE_BYTES) continue
      keep.add(entry.id)
      used += bytes
    }

    const remove = scoped.filter((entry) => !keep.has(entry.id))
    if (!remove.length) {
      database.close()
      return
    }

    const transaction = database.transaction(STORE_NAME, "readwrite")
    const store = transaction.objectStore(STORE_NAME)
    for (const entry of remove) store.delete(entry.id)
    await transactionDone(transaction)
    database.close()
  } catch {
    // Browser quota cleanup is best effort only.
  }
}

async function blobFromUrl(url: string): Promise<Blob | null> {
  try {
    const response = await fetch(url, { cache: url.startsWith("data:") ? "default" : "force-cache" })
    if (!response.ok && !url.startsWith("data:")) return null
    const blob = await response.blob()
    if (!blob.type.startsWith("image/")) return null
    if (!blob.size || blob.size > MAX_LOCAL_IMAGE_BYTES) return null
    return blob
  } catch {
    return null
  }
}

async function storeBlob(key: string, blob: Blob) {
  if (!blob.size || blob.size > MAX_LOCAL_IMAGE_BYTES) return false
  try {
    await writeEntry({
      id: key,
      blob,
      createdAt: Date.now(),
      bytes: blob.size,
      account: currentAccountScope,
    })
    void pruneCurrentAccount()
    return true
  } catch {
    return false
  }
}

function entryToDisplayUrl(entry?: StoredImage) {
  if (!entry) return ""
  if (entry.blob instanceof Blob && entry.blob.size) return URL.createObjectURL(entry.blob)
  return entry.dataUrl || ""
}

export function isStoredGeneratedImageUrl(value?: string) {
  return String(value || "").startsWith(URL_PREFIX)
}

export async function persistGeneratedImageUrl(id: string, url: string): Promise<string> {
  if (!url.startsWith("data:image/")) return url

  try {
    const key = scopedKey(`id:${id}`)
    if (await readEntry(key)) return storedUrlForKey(key)

    const blob = await blobFromUrl(url)
    if (blob && await storeBlob(key, blob)) return storedUrlForKey(key)

    // Compatibility fallback for browsers that can write strings but fail to
    // materialize a Blob from a data URL.
    await writeEntry({
      id: key,
      dataUrl: url,
      createdAt: Date.now(),
      bytes: Math.ceil(url.length * 0.75),
      account: currentAccountScope,
    })
    void pruneCurrentAccount()
    return storedUrlForKey(key)
  } catch {
    // The image must still be shown even in a private browser that blocks IDB.
    return url
  }
}

/**
 * Persist a finished image before chat state is written.
 *
 * For Render-local /api/media/asset URLs this copies the bytes into the user's
 * IndexedDB and returns a tiny malik-image:// handle. The chat therefore stores
 * only a short handle, while the actual image lives on the user's device and
 * survives logout/login, refreshes and Render redeploys on the same browser.
 */
export async function persistGeneratedImageReference(id: string, url: string): Promise<string> {
  const value = String(url || "").trim()
  if (!value || isStoredGeneratedImageUrl(value)) return value
  if (value.startsWith("data:image/")) return persistGeneratedImageUrl(id, value)

  const ownAsset = value.startsWith("/") || (() => {
    if (typeof window === "undefined") return false
    try { return new URL(value, window.location.href).origin === window.location.origin } catch { return false }
  })()
  if (!ownAsset) return value

  try {
    const key = scopedKey(`id:${id}`)
    if (await readEntry(key)) return storedUrlForKey(key)
    const blob = await blobFromUrl(value)
    if (!blob) return value
    return await storeBlob(key, blob) ? storedUrlForKey(key) : value
  } catch {
    return value
  }
}

export async function resolveGeneratedImageUrl(url: string): Promise<string> {
  if (!isStoredGeneratedImageUrl(url)) return url

  const id = decodeURIComponent(url.slice(URL_PREFIX.length))
  const value = await readEntry(id)
  if (!value) throw new Error("Сохранённое изображение не найдено. Повторите генерацию.")
  const resolved = entryToDisplayUrl(value)
  if (!resolved) throw new Error("Сохранённое изображение не найдено. Повторите генерацию.")
  return resolved
}

/*
 * Compatibility cache for old chat snapshots that still contain a
 * /api/media/asset URL instead of a malik-image:// handle.
 */
const CACHE_KEY_PREFIX = "url:"

function cacheKeyFor(url: string) {
  return scopedKey(`${CACHE_KEY_PREFIX}${url}`)
}

function legacyCacheKeyFor(url: string) {
  return `${CACHE_KEY_PREFIX}${url}`
}

function isOwnAssetUrl(url: string) {
  const value = String(url || "")
  if (value.startsWith("data:") || value.startsWith("blob:") || value.startsWith(URL_PREFIX)) return false
  if (value.startsWith("/")) return true
  if (typeof window === "undefined") return false
  try { return new URL(value, window.location.href).origin === window.location.origin } catch { return false }
}

/** The local copy of an image that was shown from url, or "" when there is none. */
export async function readCachedGeneratedImage(url: string): Promise<string> {
  if (!url) return ""
  try {
    const scoped = await readEntry(cacheKeyFor(url))
    if (scoped) return entryToDisplayUrl(scoped)

    // Read pre-account-scope cache entries created by older Malik builds.
    const legacy = await readEntry(legacyCacheKeyFor(url))
    if (!legacy) return ""

    const resolved = entryToDisplayUrl(legacy)
    if (legacy.blob instanceof Blob && legacy.blob.size) {
      void storeBlob(cacheKeyFor(url), legacy.blob)
    } else if (legacy.dataUrl) {
      void persistGeneratedImageUrl(`legacy-${hash(url)}`, legacy.dataUrl)
    }
    return resolved
  } catch {
    return ""
  }
}

/**
 * Store the bytes behind an old direct URL after it displayed successfully.
 * New generations normally use persistGeneratedImageReference() before render.
 */
export async function cacheGeneratedImageByUrl(url: string): Promise<void> {
  if (!url || !isOwnAssetUrl(url)) return
  try {
    const key = cacheKeyFor(url)
    if (await readEntry(key)) return
    const blob = await blobFromUrl(url)
    if (!blob) return
    await storeBlob(key, blob)
  } catch {
    // Private browsing/quota failures must never hide the image already on screen.
  }
}
