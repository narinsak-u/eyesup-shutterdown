import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createComment,
  createLike,
  deleteLike,
  fetchInteractionSummary,
} from '@/services/interactions'

const IP_HASH = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('interactions service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
    vi.stubEnv('VITE_INTERACTION_SPACE', 'interaction-space')
    vi.stubEnv('VITE_INTERACTION_ENVIRONMENT', 'master')
    vi.stubEnv('VITE_INTERACTION_ACCESS_TOKEN', 'interaction-token')
    vi.stubEnv('VITE_IP_DISCOVERY_URL', 'https://example.test/ip')
  })

  it('fetches likes and five newest visible comments with pagination', async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ items: [], total: 3 }))
      .mockResolvedValueOnce(jsonResponse({ items: [{ sys: { id: 'like-1' } }], total: 1 }))
      .mockResolvedValueOnce(jsonResponse({
        items: [
          {
            sys: { id: 'comment-1' },
            fields: {
              photoId: 'photo-1',
              ipHash: IP_HASH,
              text: '  hello  ',
              createdAt: '2026-08-29T12:00:00.000Z',
              status: 'visible',
            },
          },
        ],
        total: 6,
      }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchInteractionSummary('photo-1', IP_HASH)).resolves.toEqual({
      likeCount: 3,
      likedByViewer: true,
      comments: [{
        id: 'comment-1',
        photoId: 'photo-1',
        ipHash: IP_HASH,
        text: 'hello',
        createdAt: '2026-08-29T12:00:00.000Z',
        status: 'visible',
      }],
      hasMoreComments: true,
    })

    expect(fetchMock).toHaveBeenCalledTimes(3)
    const calls = fetchMock.mock.calls
    const likesQuery = new URL(String(calls[0]?.[0])).searchParams
    const viewerQuery = new URL(String(calls[1]?.[0])).searchParams
    const commentsQuery = new URL(String(calls[2]?.[0])).searchParams
    expect(likesQuery.get('content_type')).toBe('photoLike')
    expect(likesQuery.get('fields.photoId')).toBe('photo-1')
    expect(viewerQuery.get('fields.ipHash')).toBe(IP_HASH)
    expect(viewerQuery.get('fields.photoId')).toBe('photo-1')
    expect(commentsQuery.get('content_type')).toBe('photoComment')
    expect(commentsQuery.get('fields.status')).toBe('visible')
    expect(commentsQuery.get('order')).toBe('-fields.createdAt')
    expect(commentsQuery.get('limit')).toBe('5')
    expect(commentsQuery.get('skip')).toBe('0')
  })

  it('uses skip and limit for older comments', async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ items: [], total: 0 }))
      .mockResolvedValueOnce(jsonResponse({ items: [], total: 0 }))
      .mockResolvedValueOnce(jsonResponse({ items: [], total: 7 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchInteractionSummary('photo-1', IP_HASH, 5, 5)).resolves.toMatchObject({
      likeCount: 0,
      likedByViewer: false,
      comments: [],
      hasMoreComments: true,
    })
    const commentsQuery = new URL(String(fetchMock.mock.calls[2]?.[0])).searchParams
    expect(commentsQuery.get('skip')).toBe('5')
    expect(commentsQuery.get('limit')).toBe('5')
  })

  it('creates a like through the interaction-space Management API', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ sys: { id: 'like-1' } }, 201))
    vi.stubGlobal('fetch', fetchMock)

    await expect(createLike('photo-1', IP_HASH)).resolves.toBe('like-1')
    const [url, options] = fetchMock.mock.calls[0] ?? []
    expect(String(url)).toContain('/spaces/interaction-space/environments/master/entries')
    expect(options?.method).toBe('POST')
    expect(new Headers(options?.headers).get('Authorization')).toBe('Bearer interaction-token')
    expect(new Headers(options?.headers).get('X-Contentful-Content-Type')).toBe('photoLike')
    expect(JSON.parse(String(options?.body)).fields.photoId['en-US']).toBe('photo-1')
    expect(JSON.parse(String(options?.body)).fields.ipHash['en-US']).toBe(IP_HASH)
  })

  it('creates a trimmed visible comment and maps the Management API response', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({
      sys: { id: 'comment-1' },
      fields: {
        photoId: { 'en-US': 'photo-1' },
        ipHash: { 'en-US': IP_HASH },
        text: { 'en-US': 'hello' },
        createdAt: { 'en-US': '2026-08-29T12:00:00.000Z' },
        status: { 'en-US': 'visible' },
      },
    }, 201))
    vi.stubGlobal('fetch', fetchMock)

    await expect(createComment('photo-1', IP_HASH, '  hello  ')).resolves.toEqual({
      id: 'comment-1',
      photoId: 'photo-1',
      ipHash: IP_HASH,
      text: 'hello',
      createdAt: '2026-08-29T12:00:00.000Z',
      status: 'visible',
    })
    const [, options] = fetchMock.mock.calls[0] ?? []
    expect(options?.method).toBe('POST')
    expect(new Headers(options?.headers).get('X-Contentful-Content-Type')).toBe('photoComment')
  })

  it('uses the entry version returned by Management API before deleting a like', async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ sys: { id: 'like-1', version: 7 } }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(deleteLike('like-1')).resolves.toBeUndefined()
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('GET')
    expect(fetchMock.mock.calls[1]?.[1]?.method).toBe('DELETE')
    expect(new Headers(fetchMock.mock.calls[1]?.[1]?.headers).get('X-Contentful-Version')).toBe('7')
  })

  it('rejects invalid values before making a request', async () => {
    const fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchMock)

    await expect(createLike('', IP_HASH)).rejects.toThrow(/photoId/i)
    await expect(createComment('photo-1', IP_HASH, ' '.repeat(2))).rejects.toThrow(/comment/i)
    await expect(createComment('photo-1', IP_HASH, 'x'.repeat(501))).rejects.toThrow(/500/i)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
