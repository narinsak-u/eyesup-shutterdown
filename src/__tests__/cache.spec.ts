import { describe, it, expect, beforeEach, vi } from 'vitest'
import { getFresh, getStale, setCache } from '@/services/cache'

describe('cache service', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('returns null for a missing key', () => {
    expect(getFresh('missing', 1000)).toBeNull()
    expect(getStale('missing')).toBeNull()
  })

  it('getFresh returns data when within TTL', () => {
    setCache('key', { value: 42 })
    expect(getFresh<{ value: number }>('key', 5000)).toEqual({ value: 42 })
  })

  it('getFresh returns null when expired', () => {
    setCache('key', { value: 42 })
    const future = Date.now() + 10_000
    vi.spyOn(Date, 'now').mockReturnValue(future)
    expect(getFresh('key', 1000)).toBeNull()
    vi.restoreAllMocks()
  })

  it('getStale returns data even when expired', () => {
    setCache('key', { value: 42 })
    const future = Date.now() + 10_000
    vi.spyOn(Date, 'now').mockReturnValue(future)
    expect(getStale<{ value: number }>('key')).toEqual({ value: 42 })
    vi.restoreAllMocks()
  })

  it('returns null for corrupted JSON', () => {
    localStorage.setItem('cache:key', 'not-json')
    expect(getFresh('key', 1000)).toBeNull()
    expect(getStale('key')).toBeNull()
  })

  it('returns null for non-object cache entries', () => {
    localStorage.setItem('cache:key', '"just a string"')
    expect(getFresh('key', 1000)).toBeNull()
    expect(getStale('key')).toBeNull()
  })
})
