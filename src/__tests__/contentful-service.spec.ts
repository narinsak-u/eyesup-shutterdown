import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetEntries = vi.fn<(query?: unknown) => Promise<{ items: unknown[]; total: number }>>()

vi.mock('contentful', () => ({
  createClient: vi.fn<(config?: unknown) => unknown>(() => ({
    getEntries: mockGetEntries,
  })),
}))

const { fetchPhotos } = await import('@/services/contentful')

const makeRichText = (text: string) => ({
  data: {},
  content: [
    {
      data: {},
      content: [
        {
          data: {},
          marks: [],
          value: text,
          nodeType: 'text',
        },
      ],
      nodeType: 'paragraph',
    },
  ],
  nodeType: 'document',
})

const mockEntry = (overrides: Record<string, unknown> = {}) => ({
  sys: { id: 'entry-1' },
  fields: {
    location: 'Paris, FR',
    alt: makeRichText('A beautiful photo'),
    date: 'January, 2024',
    type: 'portrait',
    category: 'Architecture',
    src: {
      fields: {
        file: { url: '//images.ctfassets.net/abc/photo.jpg' },
      },
    },
    ...overrides,
  },
})

describe('contentful service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetches and maps gallery entries to Photo[]', async () => {
    mockGetEntries.mockResolvedValue({ items: [mockEntry()], total: 1 })

    const result = await fetchPhotos()

    expect(result.photos).toHaveLength(1)
    expect(result.total).toBe(1)
    expect(result.photos[0]).toEqual({
      id: 'entry-1',
      src: 'https://images.ctfassets.net/abc/photo.jpg?w=1600&fm=webp',
      thumbSrc: 'https://images.ctfassets.net/abc/photo.jpg?w=600&fit=thumb&fm=webp',
      alt: 'A beautiful photo',
      location: 'Paris, FR',
      date: 'January, 2024',
      type: 'portrait',
      category: 'Architecture',
    })
  })

  it('uses correct content type, limit, skip, and order params', async () => {
    mockGetEntries.mockResolvedValue({ items: [], total: 0 })

    await fetchPhotos(3, 9)

    expect(mockGetEntries).toHaveBeenCalledWith({
      content_type: 'gallery',
      limit: 9,
      skip: 3,
      order: ['-fields.date'],
    })
  })

  it('handles missing image gracefully', async () => {
    mockGetEntries.mockResolvedValue({ items: [mockEntry({ src: undefined })], total: 1 })

    const result = await fetchPhotos()

    expect(result.photos[0]?.src).toBe('')
  })

  it('falls back type to square for invalid values', async () => {
    mockGetEntries.mockResolvedValue({ items: [mockEntry({ type: 'panorama' })], total: 1 })

    const result = await fetchPhotos()

    expect(result.photos[0]?.type).toBe('square')
  })

  it('builds thumbSrc with Contentful image params', async () => {
    mockGetEntries.mockResolvedValue({ items: [mockEntry()], total: 1 })
    const result = await fetchPhotos()
    expect(result.photos[0]?.thumbSrc).toBe(
      'https://images.ctfassets.net/abc/photo.jpg?w=600&fit=thumb&fm=webp',
    )
  })

  it('produces empty thumbSrc when image URL is missing', async () => {
    mockGetEntries.mockResolvedValue({ items: [mockEntry({ src: undefined })], total: 1 })
    const result = await fetchPhotos()
    expect(result.photos[0]?.thumbSrc).toBe('')
  })

  it('throws when client fails', async () => {
    mockGetEntries.mockRejectedValue(new Error('API error'))

    await expect(fetchPhotos()).rejects.toThrow('API error')
  })
})
