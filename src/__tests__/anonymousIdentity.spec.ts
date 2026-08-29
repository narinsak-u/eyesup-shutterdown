import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createAnonymousIdentity,
  discoverPublicIp,
  hashIp,
} from '@/services/anonymousIdentity'

describe('anonymous identity utilities', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('hashes a normalized IP as lowercase SHA-256 hex', async () => {
    await expect(hashIp('  hello  ')).resolves.toBe(
      '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
    )
  })

  it('returns the same deterministic username and mascot for the same hash', () => {
    const ipHash = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'

    expect(createAnonymousIdentity(ipHash)).toEqual(createAnonymousIdentity(ipHash))
    expect(createAnonymousIdentity(ipHash).username).toMatch(/^[a-z]+-[a-z]+-[0-9]+$/)
    expect(createAnonymousIdentity(ipHash).avatarUrl).toMatch(/^data:image\/svg\+xml/)
  })

  it('selects different deterministic values for a different seed when available', () => {
    const first = createAnonymousIdentity('0000000000000000000000000000000000000000000000000000000000000000')
    const second = createAnonymousIdentity('ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff')

    expect(`${first.username}:${first.avatarUrl}`).not.toBe(`${second.username}:${second.avatarUrl}`)
  })

  it('discovers an IP from JSON and rejects invalid responses', async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ip: '203.0.113.7' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ip: 'not-an-ip' }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(discoverPublicIp('https://example.test/ip')).resolves.toBe('203.0.113.7')
    await expect(discoverPublicIp('https://example.test/ip')).rejects.toThrow(/valid public IP/i)
    expect(fetchMock).toHaveBeenCalledWith('https://example.test/ip', expect.objectContaining({ signal: expect.any(AbortSignal) }))
  })

  it('uses the default IP endpoint when no endpoint is configured', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ ip: '203.0.113.8' }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(discoverPublicIp()).resolves.toBe('203.0.113.8')
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api64.ipify.org?format=json',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
  })

  it('rejects a failed IP endpoint response', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 503 })))

    await expect(discoverPublicIp('https://example.test/ip')).rejects.toThrow(/discovery failed/i)
  })
})
