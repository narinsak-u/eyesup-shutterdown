# Image Performance Optimization

## Problem
The photography portfolio loads full-resolution original images (4000–6000px wide) from Contentful for grid thumbnails, causing slow initial load, slow infinite scroll, and slow image rendering. There is no caching layer, so every page load re-fetches the Contentful API.

## Approach
Combine two strategies:

1. **Contentful Images API transformations** — resize and convert images on the CDN edge
2. **Client-side SWR cache** — avoid redundant API calls on repeat visits

## Image Transformation

Append Contentful Images API query parameters to image URLs in `contentful.ts`:

| Context | Width | Fit | Format | Query param |
|---|---|---|---|---|
| Grid thumbnail | 600px | `thumb` | `webp` | `?w=600&fit=thumb&fm=webp` |
| Lightbox/expanded | Original | — | `webp` | `?fm=webp` (format only) |

## Type Changes

```ts
// src/types/gallery.ts
export interface Photo {
  id: string
  thumbSrc: string   // new — grid thumbnail (600px webp)
  src: string        // existing — lightbox (original, webp)
  alt: string
  location: string
  date: string
  type: "portrait" | "landscape" | "square"
  category: string
}
```

## Files Changed

### `src/services/contentful.ts`
- Build `thumbSrc` field: append `?w=600&fit=thumb&fm=webp` to the image URL
- Optionally append `?fm=webp` to `src` for browser-native WebP conversion

### `src/services/cache.ts` (new)
- Export `getCached<T>(key: string, maxAgeMs: number): T | null`
- Export `setCache<T>(key: string, data: T): void`
- Uses localStorage, JSON-serialized, with a `timestamp` wrapper
- Cache key: `gallery-photos-cache`

### `src/stores/gallery.ts`
- `fetchPhotos()` checks cache before calling Contentful
- Cache hit + fresh (< 15 min) → return cached data immediately, no API call
- Cache hit + stale (>= 15 min) → return cached data, then re-fetch in background and update
- Cache miss → fetch normally, then write to cache
- Only cache the initial page (skip=0). `loadMore()` always hits the API.

### `src/components/GalleryItem.vue`
- Add `thumbSrc: string` prop
- Change `<img :src>` from `src` to `thumbSrc`

### `src/components/Gallery.vue`
- Pass `item.thumbSrc` to `<GalleryItem>`

### No changes to `Lightbox.vue` — it already uses `src` for expanded view

## Cache Entry Shape

```ts
interface CacheEntry<T> {
  timestamp: number
  data: T
}
```

TTL: 15 minutes (900,000 ms).

## Not Doing

- **Service Worker** — overkill for a static gallery with no offline needs
- **`<img srcset>`** — adds template complexity; a single 600px thumbnail with Contentful CDN is sufficient for the masonry layout
- **Blur placeholder / LQIP** — adds visual noise for marginal UX gain; the fade-in scroll-reveal animation already handles appearance gracefully
