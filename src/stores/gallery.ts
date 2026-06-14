import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Photo } from '@/types/gallery'
import { fetchPhotos as fetchContentfulPhotos } from '@/services/contentful'
import { getFresh, getStale, setCache } from '@/services/cache'

const PAGE_SIZE = 9
const CACHE_KEY = 'gallery-photos'
const CACHE_TTL = 900_000

/** Manages gallery state: photo list, pagination, filtering, and lightbox. */
export const useGalleryStore = defineStore('gallery', () => {
  const photos = ref<Photo[]>([])
  const loading = ref(false)
  const loadingMore = ref(false)
  const error = ref<string | null>(null)
  const hasMore = ref(true)
  const skip = ref(0)
  const activeFilter = ref('all')
  const lightboxOpen = ref(false)
  const lightboxIndex = ref<number>(0)

  const filteredPhotos = computed(() => {
    if (activeFilter.value === 'all') return photos.value
    return photos.value.filter((p) => p.category === activeFilter.value)
  })

  function setFilter(filter: string) {
    activeFilter.value = filter
  }

  /** Fetches photos from Contentful, bypassing cache. Resets state and writes to cache on success. */
  async function fetchFromNetwork() {
    loading.value = true
    error.value = null
    skip.value = 0
    hasMore.value = true
    try {
      const result = await fetchContentfulPhotos(0, PAGE_SIZE)
      photos.value = result.photos
      hasMore.value = result.photos.length < result.total
      skip.value = result.photos.length
      setCache(CACHE_KEY, result)
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to load photos'
    } finally {
      loading.value = false
    }
  }

  /** Loads the first page of photos, serving from cache when available.
   *  Fresh cache: return immediately. Stale cache: show stale data, revalidate in background. */
  async function fetchPhotos() {
    const cached = getFresh<{ photos: Photo[]; total: number }>(CACHE_KEY, CACHE_TTL)
    if (cached) {
      photos.value = cached.photos
      return
    }

    const stale = getStale<{ photos: Photo[]; total: number }>(CACHE_KEY)
    if (stale) {
      photos.value = stale.photos
      fetchFromNetwork()
      return
    }

    await fetchFromNetwork()
  }

  /** Appends the next page of photos. No-op if already loading or all loaded. */
  async function loadMore() {
    if (loadingMore.value || !hasMore.value) return
    loadingMore.value = true
    try {
      const result = await fetchContentfulPhotos(skip.value, PAGE_SIZE)
      photos.value = [...photos.value, ...result.photos]
      hasMore.value = skip.value + result.photos.length < result.total
      skip.value += result.photos.length
    } catch {
      // silent fail for scroll-triggered loads
    } finally {
      loadingMore.value = false
    }
  }

  return {
    photos,
    loading,
    loadingMore,
    error,
    hasMore,
    activeFilter,
    lightboxOpen,
    lightboxIndex,
    filteredPhotos,
    setFilter,
    fetchPhotos,
    fetchFromNetwork,
    loadMore,
  }
})
