interface CacheEntry<T> {
  timestamp: number;
  data: T;
}

const PREFIX = "cache:";

// checks if a value is a valid cache entry
function isCacheEntry(value: unknown): value is CacheEntry<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    "timestamp" in value &&
    "data" in value &&
    typeof (value as Record<string, unknown>).timestamp === "number"
  );
}

// reads a raw cache entry from localStorage, returning null if missing or invalid
function readRaw<T>(key: string): CacheEntry<T> | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isCacheEntry(parsed)) return null;
    return parsed as CacheEntry<T>;
  } catch {
    return null;
  }
}

/** Writes data to localStorage with a timestamp. Silently ignores storage errors. */
export function setCache<T>(key: string, data: T): void {
  const entry: CacheEntry<T> = { timestamp: Date.now(), data };
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(entry));
  } catch {
    // localStorage full or unavailable — silently ignore
  }
}

/** Returns cached data only if stored within `maxAgeMs`. Returns null if missing or expired. */
export function getFresh<T>(key: string, maxAgeMs: number): T | null {
  const entry = readRaw<T>(key);
  if (entry === null) return null;
  if (Date.now() - entry.timestamp >= maxAgeMs) return null;
  return entry.data;
}

/** Returns cached data regardless of age. Returns null if missing. Used for SWR stale-while-revalidate. */
export function getStale<T>(key: string): T | null {
  const entry = readRaw<T>(key);
  return entry?.data ?? null;
}
