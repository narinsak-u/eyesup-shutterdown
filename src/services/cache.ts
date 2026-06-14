interface CacheEntry<T> {
  timestamp: number
  data: T
}

const PREFIX = 'cache:'

function isCacheEntry(value: unknown): value is CacheEntry<unknown> {
  return (
    typeof value === 'object'
    && value !== null
    && 'timestamp' in value
    && 'data' in value
    && typeof (value as Record<string, unknown>).timestamp === 'number'
  )
}

function readRaw<T>(key: string): CacheEntry<T> | null {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    if (raw === null) return null
    const parsed: unknown = JSON.parse(raw)
    if (!isCacheEntry(parsed)) return null
    return parsed as CacheEntry<T>
  } catch {
    return null
  }
}

export function setCache<T>(key: string, data: T): void {
  const entry: CacheEntry<T> = { timestamp: Date.now(), data }
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(entry))
  } catch {
    // localStorage full or unavailable — silently ignore
  }
}

export function getFresh<T>(key: string, maxAgeMs: number): T | null {
  const entry = readRaw<T>(key)
  if (entry === null) return null
  if (Date.now() - entry.timestamp >= maxAgeMs) return null
  return entry.data
}

export function getStale<T>(key: string): T | null {
  const entry = readRaw<T>(key)
  return entry?.data ?? null
}
