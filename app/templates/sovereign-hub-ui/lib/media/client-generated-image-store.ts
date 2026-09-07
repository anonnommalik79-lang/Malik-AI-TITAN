const DATABASE_NAME = "malik-ai-generated-media"
const DATABASE_VERSION = 1
const STORE_NAME = "images"
const URL_PREFIX = "malik-image://"

type StoredImage = {
  id: string
  dataUrl: string
  createdAt: number
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
      if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME, { keyPath: "id" })
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

export function isStoredGeneratedImageUrl(value?: string) {
  return String(value || "").startsWith(URL_PREFIX)
}

export async function persistGeneratedImageUrl(id: string, url: string): Promise<string> {
  if (!url.startsWith("data:image/")) return url

  try {
    const database = await openDatabase()
    const transaction = database.transaction(STORE_NAME, "readwrite")
    transaction.objectStore(STORE_NAME).put({ id, dataUrl: url, createdAt: Date.now() } satisfies StoredImage)
    await transactionDone(transaction)
    database.close()
    return `${URL_PREFIX}${encodeURIComponent(id)}`
  } catch {
    // The image must still be shown even in a private browser that blocks IDB.
    return url
  }
}

export async function resolveGeneratedImageUrl(url: string): Promise<string> {
  if (!isStoredGeneratedImageUrl(url)) return url

  const id = decodeURIComponent(url.slice(URL_PREFIX.length))
  const database = await openDatabase()
  const value = await new Promise<StoredImage | undefined>((resolve, reject) => {
    const request = database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(id)
    request.onsuccess = () => resolve(request.result as StoredImage | undefined)
    request.onerror = () => reject(request.error || new Error("Could not restore generated image"))
  })
  database.close()
  if (!value?.dataUrl) throw new Error("Сохранённое изображение не найдено. Повторите генерацию.")
  return value.dataUrl
}

/*
 * Keeping a generated image alive after the server forgets it.
 *
 * A finished image comes back as /api/media/asset/<id>, which is durable only
 * while the server still holds the bytes. Render restarts on every deploy and
 * on idle, so an image generated an hour ago renders as "Сохранённое
 * изображение недоступно" the next time the page is opened - and the only
 * copy that was kept locally was the one the server happened to inline as a
 * data: URL, which it usually does not.
 *
 * So the browser keeps its own copy. The key is the URL itself, which means
 * nothing has to be threaded through the components that display it, and the
 * copy lives in the viewer's IndexedDB - not in the repository and not on the
 * host. Same-origin only: this is for images this app produced, not a general
 * cache of the internet.
 */

const CACHE_KEY_PREFIX = "url:"

function cacheKeyFor(url: string) {
  return `${CACHE_KEY_PREFIX}${url}`
}

function isOwnAssetUrl(url: string) {
  const value = String(url || "")
  if (value.startsWith("data:")) return false
  if (value.startsWith("/")) return true
  if (typeof window === "undefined") return false
  try { return new URL(value, window.location.href).origin === window.location.origin } catch { return false }
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

/** The local copy of an image that was shown from `url`, or "" when there is none. */
export async function readCachedGeneratedImage(url: string): Promise<string> {
  if (!url) return ""
  try {
    const entry = await readEntry(cacheKeyFor(url))
    return entry?.dataUrl || ""
  } catch {
    return ""
  }
}

/**
 * Store the bytes behind a URL that has just displayed successfully.
 *
 * Called after the image is already on screen, so the fetch is served from the
 * browser's own HTTP cache and costs nothing visible. Every failure is
 * swallowed: a private window that blocks IndexedDB, a quota that is full or an
 * opaque response must never turn into an error where a picture used to be.
 */
export async function cacheGeneratedImageByUrl(url: string): Promise<void> {
  if (!url || !isOwnAssetUrl(url)) return
  try {
    const key = cacheKeyFor(url)
    if (await readEntry(key)) return

    const response = await fetch(url, { cache: "force-cache" })
    if (!response.ok) return
    const blob = await response.blob()
    if (!blob.type.startsWith("image/")) return
    // Six megabytes: comfortably above a generated still, far below the point
    // where one image would crowd out a viewer's whole history.
    if (blob.size > 6 * 1024 * 1024) return

    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result || ""))
      reader.onerror = () => reject(reader.error || new Error("Could not read image bytes"))
      reader.readAsDataURL(blob)
    })
    if (!dataUrl.startsWith("data:image/")) return

    const database = await openDatabase()
    try {
      const transaction = database.transaction(STORE_NAME, "readwrite")
      transaction.objectStore(STORE_NAME).put({ id: key, dataUrl, createdAt: Date.now() } satisfies StoredImage)
      await transactionDone(transaction)
    } finally {
      database.close()
    }
  } catch {
    // Deliberately silent - see the doc comment.
  }
}
