type CacheItem<T> = {
  value: T;
  expiresAt: number;
};

const memory = new Map<string, CacheItem<unknown>>();

export function normalizeCacheKey(input: string) {
  return input.toLowerCase().trim().replace(/\s+/g, " ").slice(0, 420);
}

export function getCache<T>(key: string): T | null {
  const item = memory.get(key);
  if (!item) return null;

  if (Date.now() > item.expiresAt) {
    memory.delete(key);
    return null;
  }

  return item.value as T;
}

export function setCache<T>(key: string, value: T, ttlMs?: number) {
  const ttl = ttlMs || Number(process.env.RESEARCH_CACHE_TTL_MS || 1000 * 60 * 60 * 6);
  memory.set(key, { value, expiresAt: Date.now() + ttl });
}
