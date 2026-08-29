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
