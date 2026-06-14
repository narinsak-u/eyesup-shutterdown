import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useGalleryStore } from '@/stores/gallery'
import type { Photo } from '@/types/gallery'
import type { FetchPhotosResult } from '@/services/contentful'
import { setCache } from '@/services/cache'

vi.mock('@/services/contentful', () => ({
  fetchPhotos: vi.fn<() => Promise<FetchPhotosResult>>(),
}))

const { fetchPhotos } = await import('@/services/contentful')

const mockPhotos: Photo[] = [
  {
    id: '1',
    thumbSrc: 'https://images.ctfassets.net/abc/image.jpg?w=600&fit=thumb&fm=webp',
    src: 'https://images.ctfassets.net/abc/image.jpg',
    alt: 'Test photo',
    location: 'Test, Location',
    date: 'Jan 2024',
    type: 'landscape',
    category: 'Nature',
  },
]

const mockPage2: Photo[] = [
  {
    id: '2',
    thumbSrc: 'https://images.ctfassets.net/abc/image2.jpg?w=600&fit=thumb&fm=webp',
    src: 'https://images.ctfassets.net/abc/image2.jpg',
    alt: 'Another photo',
    location: 'Test, Place',
    date: 'Feb 2024',
    type: 'portrait',
    category: 'Architecture',
  },
]

describe('galleryStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('starts with empty photos, not loading, no error', () => {
    const store = useGalleryStore()
    expect(store.photos).toEqual([])
    expect(store.loading).toBe(false)
    expect(store.error).toBeNull()
  })

  it('sets photos on successful initial fetch', async () => {
    vi.mocked(fetchPhotos).mockResolvedValue({ photos: mockPhotos, total: 2 })
    const store = useGalleryStore()
    await store.fetchPhotos()
    expect(store.photos).toEqual(mockPhotos)
    expect(store.loading).toBe(false)
    expect(store.error).toBeNull()
  })

  it('sets error on failed fetch', async () => {
    vi.mocked(fetchPhotos).mockRejectedValue(new Error('Network error'))
    const store = useGalleryStore()
    await store.fetchPhotos()
    expect(store.photos).toEqual([])
    expect(store.loading).toBe(false)
    expect(store.error).toBe('Network error')
  })

  it('sets loading during initial fetch', async () => {
    let resolvePromise!: (value: FetchPhotosResult | PromiseLike<FetchPhotosResult>) => void
    vi.mocked(fetchPhotos).mockReturnValue(
      new Promise((resolve) => {
        resolvePromise = resolve
      }),
    )
    const store = useGalleryStore()
    const promise = store.fetchPhotos()
    expect(store.loading).toBe(true)
    resolvePromise({ photos: mockPhotos, total: 2 })
    await promise
    expect(store.loading).toBe(false)
  })

  it('appends photos on loadMore and tracks hasMore', async () => {
    vi.mocked(fetchPhotos).mockResolvedValueOnce({ photos: mockPhotos, total: 2 })
    vi.mocked(fetchPhotos).mockResolvedValueOnce({ photos: mockPage2, total: 2 })

    const store = useGalleryStore()
    await store.fetchPhotos()
    expect(store.photos).toEqual(mockPhotos)
    expect(store.hasMore).toBe(true)

    await store.loadMore()
    expect(store.photos).toEqual([...mockPhotos, ...mockPage2])
    expect(store.hasMore).toBe(false)
  })

  it('does not loadMore when hasMore is false', async () => {
    vi.mocked(fetchPhotos).mockResolvedValue({ photos: mockPhotos, total: 1 })

    const store = useGalleryStore()
    await store.fetchPhotos()
    expect(store.hasMore).toBe(false)

    await store.loadMore()
    expect(fetchPhotos).toHaveBeenCalledTimes(1)
  })

  it('returns cached data from fresh cache without API call', async () => {
    setCache('gallery-photos', { photos: mockPhotos, total: 1 })
    const store = useGalleryStore()
    await store.fetchPhotos()
    expect(store.photos).toEqual(mockPhotos)
    expect(vi.mocked(fetchPhotos)).not.toHaveBeenCalled()
  })

  it('shows stale cache then revalidates in background', async () => {
    const staleEntry = JSON.stringify({
      timestamp: Date.now() - 900_001,
      data: { photos: mockPhotos, total: 10 },
    })
    localStorage.setItem('cache:gallery-photos', staleEntry)

    let resolveDeferred!: (value: FetchPhotosResult) => void
    const deferred = new Promise<FetchPhotosResult>((resolve) => {
      resolveDeferred = resolve
    })
    vi.mocked(fetchPhotos).mockReturnValue(deferred)

    const store = useGalleryStore()
    store.fetchPhotos()
    // flush microtasks so stale data is applied and background fetch begins
    await Promise.resolve()

    expect(store.photos).toEqual(mockPhotos)
    expect(vi.mocked(fetchPhotos)).toHaveBeenCalledWith(0, 9)

    // let background revalidation complete
    resolveDeferred!({ photos: mockPage2, total: 2 })
    await deferred
  })

  it('loadMore always calls the API and does not cache', async () => {
    setCache('gallery-photos', { photos: mockPhotos, total: 2 })
    vi.mocked(fetchPhotos).mockResolvedValue({ photos: mockPage2, total: 2 })

    const store = useGalleryStore()
    await store.loadMore()

    expect(vi.mocked(fetchPhotos)).toHaveBeenCalledTimes(1)
  })
})
