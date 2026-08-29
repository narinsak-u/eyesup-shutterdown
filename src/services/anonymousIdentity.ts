import mascot01 from '@/assets/avatars/mascot-01.svg'
import mascot02 from '@/assets/avatars/mascot-02.svg'
import mascot03 from '@/assets/avatars/mascot-03.svg'
import mascot04 from '@/assets/avatars/mascot-04.svg'
import mascot05 from '@/assets/avatars/mascot-05.svg'
import mascot06 from '@/assets/avatars/mascot-06.svg'

const IP_DISCOVERY_TIMEOUT_MS = 5_000
const DEFAULT_IP_DISCOVERY_URL = 'https://api64.ipify.org?format=json'
const ADJECTIVES = ['amber', 'brisk', 'calm', 'dapper', 'gentle', 'mellow', 'nimble', 'sunny']
const NOUNS = ['badger', 'beaver', 'otter', 'panda', 'quokka', 'robin', 'seal', 'turtle']
const NUMBERS = ['7', '13', '21', '28', '34', '42', '56', '64']
const AVATARS = [mascot01, mascot02, mascot03, mascot04, mascot05, mascot06]

/** The stable, anonymous identity shown beside a visitor's interactions. */
export interface AnonymousIdentity {
  ipHash: string
  username: string
  avatarUrl: string
}

function isValidIpv4(value: string): boolean {
  const octets = value.split('.')
  return octets.length === 4 && octets.every((octet) => {
    if (!/^\d+$/.test(octet)) return false
    const number = Number(octet)
    return number >= 0 && number <= 255
  })
}

function isValidIpv6(value: string): boolean {
  if (!value || value.includes('%')) return false

  let normalized = value
  const ipv4Separator = normalized.lastIndexOf(':')
  if (normalized.includes('.') && ipv4Separator !== -1) {
    const ipv4 = normalized.slice(ipv4Separator + 1)
    if (!isValidIpv4(ipv4)) return false
    normalized = `${normalized.slice(0, ipv4Separator)}:0:0`
  }

  const compressionCount = normalized.match(/::/g)?.length ?? 0
  if (compressionCount > 1) return false

  if (compressionCount === 1) {
    const [left = '', right = ''] = normalized.split('::')
    const groups = [...(left ? left.split(':') : []), ...(right ? right.split(':') : [])]
    return groups.length < 8 && groups.every((group) => /^[0-9a-f]{1,4}$/i.test(group))
  }

  const groups = normalized.split(':')
  return groups.length === 8 && groups.every((group) => /^[0-9a-f]{1,4}$/i.test(group))
}

function isValidIp(value: string): boolean {
  return isValidIpv4(value) || isValidIpv6(value)
}

async function readIpResponse(response: Response): Promise<string> {
  const contentType = response.headers?.get('content-type')
  let payload: unknown

  if (contentType?.includes('json') && typeof response.json === 'function') {
    payload = await response.json()
  } else if (typeof response.text === 'function') {
    payload = await response.text()
    if (typeof payload === 'string') {
      try {
        payload = JSON.parse(payload) as unknown
      } catch {
        // Plain-text IP endpoints are supported as well as JSON endpoints.
      }
    }
  } else if (typeof response.json === 'function') {
    payload = await response.json()
  }

  const ip = typeof payload === 'string'
    ? payload.trim()
    : payload && typeof payload === 'object' && 'ip' in payload && typeof payload.ip === 'string'
      ? payload.ip.trim()
      : ''

  if (!isValidIp(ip)) {
    throw new Error('IP discovery returned an invalid public IP.')
  }

  return ip.toLowerCase()
}

/** Discovers and validates a visitor's public IP without exposing it to Contentful. */
export async function discoverPublicIp(
  endpoint = DEFAULT_IP_DISCOVERY_URL,
): Promise<string> {

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), IP_DISCOVERY_TIMEOUT_MS)

  try {
    const response = await fetch(endpoint, { signal: controller.signal })
    if (response.ok === false) throw new Error(`IP discovery failed with status ${response.status}.`)
    return await readIpResponse(response)
  } catch (error) {
    if (error instanceof Error && error.message.includes('invalid public IP')) throw error
    if (controller.signal.aborted) throw new Error('IP discovery timed out.')
    if (error instanceof Error && error.message.startsWith('IP discovery failed')) throw error
    throw new Error('Could not discover a public IP.')
  } finally {
    clearTimeout(timeoutId)
  }
}

/** Hashes an IP using Web Crypto SHA-256 and returns lowercase hexadecimal output. */
export async function hashIp(ip: string, cryptoApi: Crypto = globalThis.crypto): Promise<string> {
  const normalizedIp = ip.trim().toLowerCase()
  if (!normalizedIp) throw new Error('An IP is required to create an anonymous identity.')
  if (!cryptoApi?.subtle) throw new Error('Web Crypto is unavailable for anonymous identity.')

  const bytes = await cryptoApi.subtle.digest('SHA-256', new TextEncoder().encode(normalizedIp))
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** Maps a SHA-256 hash to a stable username and one bundled mascot avatar. */
export function createAnonymousIdentity(ipHash: string): AnonymousIdentity {
  const normalizedHash = ipHash.trim().toLowerCase()
  if (!/^[0-9a-f]{64}$/.test(normalizedHash)) {
    throw new Error('A SHA-256 IP hash is required to create an anonymous identity.')
  }

  const firstByte = Number.parseInt(normalizedHash.slice(0, 2), 16)
  const secondByte = Number.parseInt(normalizedHash.slice(2, 4), 16)
  const thirdByte = Number.parseInt(normalizedHash.slice(4, 6), 16)
  const adjective = ADJECTIVES[firstByte % ADJECTIVES.length] ?? ''
  const noun = NOUNS[secondByte % NOUNS.length] ?? ''
  const number = NUMBERS[thirdByte % NUMBERS.length] ?? ''
  const avatarUrl = AVATARS[firstByte % AVATARS.length] ?? ''

  return {
    ipHash: normalizedHash,
    username: `${adjective}-${noun}-${number}`,
    avatarUrl,
  }
}
