# Image Performance Optimization — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) for tracking.

**Goal:** Speed up image loading by serving resized WebP thumbnails via Contentful's Images API and caching API responses client-side.

**Architecture:** Add `thumbSrc` field to Photo for grid thumbnails (600px WebP). Create a generic localStorage cache service with fresh/stale retrieval. Integrate cache into gallery store (SWR pattern: serve cached data immediately, revalidate in background). No server-side changes — all transformations happen at Contentful's CDN edge.

**Tech Stack:** Contentful Images API (query params), localStorage, TypeScript, Vue 3

---

### Task 1: Add `thumbSrc` to Photo type and update test fixtures

**Files:**
- Modify: `src/types/gallery.ts`
- Modify: `src/__tests__/contentful-service.spec.ts`
- Modify: `src/__tests__/gallery-store.spec.ts`

- [ ] **Step 1: Update Photo interface** in `src/types/gallery.ts`

```ts
export interface Photo {
  id: string;
  thumbSrc: string;
  src: string;
  alt: string;
  location: string;
  date: string;
  type: "portrait" | "landscape" | "square";
  category: string;
}
```

- [ ] **Step 2: Add `thumbSrc` to mock photos** in `src/__tests__/gallery-store.spec.ts`

In `mockPhotos`:
```ts
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
```

Same pattern for `mockPage2`.

- [ ] **Step 3: Add `thumbSrc` to fetchPhotos expectation** in `src/__tests__/contentful-service.spec.ts`

In the "fetches and maps gallery entries to Photo[]" test, add `thumbSrc` to the expected object:
```ts
expect(result.photos[0]).toEqual({
  id: 'entry-1',
  src: 'https://images.ctfassets.net/abc/photo.jpg',
  thumbSrc: 'https://images.ctfassets.net/abc/photo.jpg?w=600&fit=thumb&fm=webp',
  alt: 'A beautiful photo',
  location: 'Paris, FR',
  date: 'January, 2024',
  type: 'portrait',
  category: 'Architecture',
})
```

- [ ] **Step 4: Run tests to verify they fail (type error)**

Run: `npx vitest run`
Expected: TypeScript compilation fails — `mockPhotos` and `mockPage2` objects missing `thumbSrc` property.

- [ ] **Step 5: Commit**

```bash
git add src/types/gallery.ts src/__tests__/gallery-store.spec.ts src/__tests__/contentful-service.spec.ts
git commit -m "feat: add thumbSrc field to Photo type"
```

---

### Task 2: Create cache service

**Files:**
- Create: `src/services/cache.ts`
- Create: `src/__tests__/cache.spec.ts`

- [ ] **Step 1: Write the failing test for cache service**

Create `src/__tests__/cache.spec.ts`:

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/__tests__/cache.spec.ts`
Expected: FAIL — `@/services/cache` module not found

- [ ] **Step 3: Write the cache service**

Create `src/services/cache.ts`:

```ts
interface CacheEntry<T> {
  timestamp: number;
  data: T;
}

const PREFIX = 'cache:';

function isCacheEntry(value: unknown): value is CacheEntry<unknown> {
  return (
    typeof value === 'object'
    && value !== null
    && 'timestamp' in value
    && 'data' in value
    && typeof (value as Record<string, unknown>).timestamp === 'number'
  );
}

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

export function setCache<T>(key: string, data: T): void {
  const entry: CacheEntry<T> = { timestamp: Date.now(), data };
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(entry));
  } catch {
    // localStorage full or unavailable — silently ignore
  }
}

export function getFresh<T>(key: string, maxAgeMs: number): T | null {
  const entry = readRaw<T>(key);
  if (entry === null) return null;
  if (Date.now() - entry.timestamp >= maxAgeMs) {
    localStorage.removeItem(PREFIX + key);
    return null;
  }
  return entry.data;
}

export function getStale<T>(key: string): T | null {
  const entry = readRaw<T>(key);
  return entry?.data ?? null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/__tests__/cache.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/cache.ts src/__tests__/cache.spec.ts
git commit -m "feat: add localStorage cache service with TTL"
```

---

### Task 3: Build `thumbSrc` in Contentful service

**Files:**
- Modify: `src/services/contentful.ts`
- Test: `src/__tests__/contentful-service.spec.ts`

- [ ] **Step 1: Write tests for thumbSrc construction**

Add inside `describe('contentful service', () => {})` in `src/__tests__/contentful-service.spec.ts`:

```ts
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
```

- [ ] **Step 2: Run tests to see thumbSrc tests fail**

Run: `npx vitest run src/__tests__/contentful-service.spec.ts`
Expected: The two new tests fail because `thumbSrc` is `undefined`. The "fetches and maps" test may also fail if the `toEqual` assertion wasn't updated in Task 1 — fix it if needed.

- [ ] **Step 3: Update contentful.ts to build thumbSrc**

In `src/services/contentful.ts`, inside the `response.items.map` callback, after `const imageUrl = ...`, add:

```ts
const thumbSrc = imageUrl ? `https:${imageUrl}?w=600&fit=thumb&fm=webp` : "";
```

Then add `thumbSrc` to the returned object:

```ts
return {
  id: entry.sys.id,
  src: imageUrl ? `https:${imageUrl}` : "",
  thumbSrc,
  alt: getAltText(fields.alt),
  location: fields.location as string,
  date: formatDate(fields.date as string),
  type: validateType(fields.type as string),
  category: fields.category as string,
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/contentful-service.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/contentful.ts src/__tests__/contentful-service.spec.ts
git commit -m "feat: build thumbSrc with Contentful image transformation params"
```

---

### Task 4: Integrate cache into gallery store

**Files:**
- Modify: `src/stores/gallery.ts`
- Modify: `src/__tests__/gallery-store.spec.ts`

- [ ] **Step 1: Add cache imports and constants to the store**

In `src/stores/gallery.ts`:

```ts
import { getFresh, getStale, setCache } from '@/services/cache'

const PAGE_SIZE = 9
const CACHE_KEY = 'gallery-photos'
const CACHE_TTL = 900_000 // 15 minutes
```

- [ ] **Step 2: Refactor fetchPhotos to use cache**

Replace the `fetchPhotos` function in `src/stores/gallery.ts`:

```ts
async function fetchFromNetwork() {
  loading.value = true;
  error.value = null;
  skip.value = 0;
  hasMore.value = true;
  try {
    const result = await fetchContentfulPhotos(0, PAGE_SIZE);
    photos.value = result.photos;
    hasMore.value = skip.value + result.photos.length < result.total;
    skip.value = result.photos.length;
    setCache(CACHE_KEY, result);
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Failed to load photos";
  } finally {
    loading.value = false;
  }
}

async function fetchPhotos() {
  const cached = getFresh<{ photos: Photo[]; total: number }>(CACHE_KEY, CACHE_TTL);
  if (cached) {
    photos.value = cached.photos;
    return;
  }

  const stale = getStale<{ photos: Photo[]; total: number }>(CACHE_KEY);
  if (stale) {
    photos.value = stale.photos;
    fetchFromNetwork();
    return;
  }

  await fetchFromNetwork();
}
```

Also add `import type { Photo } from '@/types/gallery'` — it's already imported, just confirm the import path works (from the existing store code, it imports `type { Photo }`).

Add `fetchFromNetwork` to the store's return object:

```ts
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
  loadMore,
  fetchFromNetwork,
}
```

- [ ] **Step 3: Write tests for caching behavior**

Add `import { getFresh, getStale, setCache } from '@/services/cache'` at the top of `src/__tests__/gallery-store.spec.ts`.

Add `localStorage.clear()` to the `beforeEach` block:

```ts
beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  localStorage.clear()
})
```

Add these tests inside `describe('galleryStore', () => {})`:

```ts
it('returns cached data from fresh cache without API call', async () => {
  setCache('gallery-photos', { photos: mockPhotos, total: 1 })
  const store = useGalleryStore()
  await store.fetchPhotos()
  expect(store.photos).toEqual(mockPhotos)
  expect(vi.mocked(fetchPhotos)).not.toHaveBeenCalled()
})

it('shows stale cache then revalidates in background', async () => {
  // Manually write a stale cache entry (timestamp in the past)
  const staleEntry = JSON.stringify({
    timestamp: Date.now() - 900_001,
    data: { photos: mockPhotos, total: 10 },
  })
  localStorage.setItem('cache:gallery-photos', staleEntry)

  vi.mocked(fetchPhotos).mockResolvedValue({ photos: mockPage2, total: 2 })

  const store = useGalleryStore()
  await store.fetchPhotos()

  // Shows stale data immediately
  expect(store.photos).toEqual(mockPhotos)
  // Background re-fetch should have been called
  expect(vi.mocked(fetchPhotos)).toHaveBeenCalledWith(0, 9)
})

it('loadMore always calls the API and does not cache', async () => {
  setCache('gallery-photos', { photos: mockPhotos, total: 2 })
  vi.mocked(fetchPhotos).mockResolvedValue({ photos: mockPage2, total: 2 })

  const store = useGalleryStore()
  await store.loadMore()

  expect(vi.mocked(fetchPhotos)).toHaveBeenCalledTimes(1)
})
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/gallery-store.spec.ts`
Expected: PASS

Run: `npx vitest run src/__tests__/cache.spec.ts`
Expected: PASS (cache service still works independently)

- [ ] **Step 5: Commit**

```bash
git add src/services/cache.ts src/stores/gallery.ts src/__tests__/gallery-store.spec.ts
git commit -m "feat: integrate SWR cache into gallery store"
```

---

### Task 5: Update GalleryItem component to use thumbSrc

**Files:**
- Modify: `src/components/GalleryItem.vue`
- Create: `src/__tests__/GalleryItem.spec.ts`

- [ ] **Step 1: Write test for thumbSrc prop**

Create `src/__tests__/GalleryItem.spec.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import GalleryItem from '../components/GalleryItem.vue'

describe('GalleryItem', () => {
  const baseProps = {
    src: 'https://example.com/photo.jpg',
    thumbSrc: 'https://example.com/photo.jpg?w=600&fit=thumb&fm=webp',
    alt: 'A test photo',
    location: 'Paris, FR',
    date: 'May, 2026',
    type: 'landscape' as const,
  }

  it('renders the thumbSrc as image src', () => {
    const wrapper = mount(GalleryItem as any, { props: baseProps })
    const img = wrapper.find('img')
    expect(img.attributes('src')).toBe(baseProps.thumbSrc)
  })

  it('renders location and date text', () => {
    const wrapper = mount(GalleryItem as any, { props: baseProps })
    expect(wrapper.text()).toContain('Paris, FR')
    expect(wrapper.text()).toContain('May, 2026')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/__tests__/GalleryItem.spec.ts`
Expected: FAIL — `thumbSrc` prop not defined, template uses `src`.

- [ ] **Step 3: Update GalleryItem.vue**

Add `thumbSrc` to props:

```ts
defineProps<{
  src: string;
  thumbSrc: string;
  alt: string;
  location: string;
  date: string;
  type: "portrait" | "landscape" | "square";
}>();
```

Change the template `<img :src="src"` to `<img :src="thumbSrc"`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/GalleryItem.spec.ts`
Expected: PASS

Run: `npx vitest run src/__tests__/gallery-store.spec.ts`
Expected: PASS (no regression)

- [ ] **Step 5: Commit**

```bash
git add src/components/GalleryItem.vue src/__tests__/GalleryItem.spec.ts
git commit -m "feat: use thumbSrc in GalleryItem for grid thumbnails"
```

---

### Task 6: Pass thumbSrc from Gallery to GalleryItem

**Files:**
- Modify: `src/components/Gallery.vue`

- [ ] **Step 1: Update Gallery.vue template**

In `src/components/Gallery.vue`, find the `<GalleryItem` usage inside the `v-for` loop and add `:thumbSrc="item.thumbSrc"`:

```html
<GalleryItem
  v-for="(item, index) in galleryStore.filteredPhotos"
  :key="item.id"
  :src="item.src"
  :thumbSrc="item.thumbSrc"
  :alt="item.alt"
  :location="item.location"
  :date="item.date"
  :type="item.type"
  @click="openPhoto(index)"
/>
```

- [ ] **Step 2: Run full test suite**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 3: Run type check**

Run: `npm run type-check`
Expected: PASS

- [ ] **Step 4: Run lint**

Run: `npm run lint`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/Gallery.vue
git commit -m "feat: pass thumbSrc to GalleryItem in gallery template"
```

---

### Task 7: Final verification

**Files:** (none — full suite run)

- [ ] **Step 1: Run full test suite with verbose output**

Run: `npx vitest run --reporter=verbose`
Expected: All tests PASS

- [ ] **Step 2: Run type-check**

Run: `npm run type-check`
Expected: No errors

- [ ] **Step 3: Run lint**

Run: `npm run lint`
Expected: No errors

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: Build succeeds, output in `dist/`
