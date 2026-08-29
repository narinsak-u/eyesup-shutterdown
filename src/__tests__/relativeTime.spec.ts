import { describe, expect, it } from 'vitest'

import { formatRelativeTime } from '@/utils/relativeTime'

describe('formatRelativeTime', () => {
  const now = new Date('2026-08-29T10:23:36.263Z')

  it('formats a timestamp from two minutes ago', () => {
    expect(formatRelativeTime('2026-08-29T10:21:36.263Z', now)).toBe('2 min ago')
  })

  it('uses readable units as timestamps get older', () => {
    expect(formatRelativeTime('2026-08-29T10:23:06.263Z', now)).toBe('just now')
    expect(formatRelativeTime('2026-08-29T08:23:36.263Z', now)).toBe('2 hr ago')
    expect(formatRelativeTime('2026-08-27T10:23:36.263Z', now)).toBe('2 days ago')
    expect(formatRelativeTime('2025-08-29T10:23:36.263Z', now)).toBe('1 yr ago')
  })

  it('falls back to the original value for invalid dates', () => {
    expect(formatRelativeTime('not-a-date', now)).toBe('not-a-date')
  })
})
