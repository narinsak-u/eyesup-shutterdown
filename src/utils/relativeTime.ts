const UNITS = [
  { seconds: 365 * 24 * 60 * 60, suffix: 'yr' },
  { seconds: 30 * 24 * 60 * 60, suffix: 'mo' },
  { seconds: 24 * 60 * 60, suffix: 'day' },
  { seconds: 60 * 60, suffix: 'hr' },
  { seconds: 60, suffix: 'min' },
] as const

/** Formats an ISO timestamp as a compact relative time label. */
export function formatRelativeTime(value: string, now = new Date()): string {
  const timestamp = new Date(value)
  if (Number.isNaN(timestamp.getTime())) return value

  const elapsedSeconds = Math.max(0, Math.floor((now.getTime() - timestamp.getTime()) / 1000))
  if (elapsedSeconds < 60) return 'just now'

  for (const unit of UNITS) {
    if (elapsedSeconds >= unit.seconds) {
      const amount = Math.floor(elapsedSeconds / unit.seconds)
      const suffix = unit.suffix === 'day' && amount !== 1 ? 'days' : unit.suffix
      return `${amount} ${suffix} ago`
    }
  }

  return 'just now'
}
