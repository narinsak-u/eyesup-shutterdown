# AGENTS.md — eyesup-shutterdown

## Project
A minimalist photography portfolio gallery (Vue 3 + Contentful CMS). Photos loaded from Contentful, displayed in a masonry grid with category filtering, infinite scroll, and a lightbox viewer. Deployed to GitHub Pages via CI.

## Tech Stack
- **Framework:** Vue 3 (Composition API, `<script setup lang="ts">`)
- **Language:** TypeScript ~6.0
- **State:** Pinia (composition stores)
- **Routing:** Vue Router 5
- **Styling:** TailwindCSS v4 + PostCSS
- **CMS:** Contentful (Content Delivery API)
- **Build:** Vite 8
- **Testing:** Vitest 4 + jsdom + @vue/test-utils 2
- **Linting:** ESLint 10 + oxlint 1.60
- **Type-checking:** vue-tsc 3
- **Node:** ^20.19.0 \|\| >=22.12.0

## Commands
| Command | Action |
|---|---|
| `npm run dev` | Start dev server (Vite) |
| `npm run build` | Type-check + build |
| `npm run build-only` | Build without type-check |
| `npm run type-check` | `vue-tsc --build` |
| `npm run preview` | Preview production build |
| `npm run test:unit` | Run all unit tests (Vitest) |
| `npm run lint` | oxlint + ESLint with --fix |
| `npm run lint:oxlint` | oxlint . --fix |
| `npm run lint:eslint` | ESLint . --fix --cache |

### Running a single test
```sh
npx vitest run src/__tests__/Gallery.spec.ts
npx vitest run src/__tests__/Gallery.spec.ts --reporter=verbose
```
### Watch mode
```sh
npx vitest src/__tests__/Gallery.spec.ts
```

## Project Structure
```
src/
  __tests__/        # Unit tests (*.spec.ts)
  components/       # Vue components (Gallery, GalleryItem, Lightbox, Footer)
  router/           # Vue Router setup (currently empty routes)
  services/         # Contentful API integration
  stores/           # Pinia store (gallery)
  types/            # Shared TypeScript interfaces
  App.vue           # Root component
  main.ts           # App entry point
  style.css         # Global styles, Tailwind @theme, @utility, animations
```

## CI (GitHub Actions)
- Runs on push/PR to `main`
- Steps: `npm ci` → `npm run test:unit` → `npm run build` → deploy to GitHub Pages
- Requires secrets: `VITE_CONTENTFUL_SPACE`, `VITE_CONTENTFUL_ACCESS_TOKEN`, `GH_TOKEN`

## Code Style

### Vue SFC Structure
Components use `<script setup lang="ts">` with three sections in order:
1. `<script setup lang="ts">` — imports, props/emits/model, local interfaces, state, logic
2. `<template>` — markup
3. `<style>` (not used — all styles in `src/style.css`)

### Imports
- External packages first (`vue`, `pinia`, `vue-router`, `contentful`)
- Internal `@/` alias next (`@/stores/gallery`, `@/types/gallery`)
- Relative imports last (`./GalleryItem.vue`, `../App.vue`)
- CSS imports at the bottom of the script section
- Blank line between import groups

### Quotes & Semicolons
- **Double quotes** in `.vue` files (`<script setup>` and `<template>`)
- **Single quotes** in standalone `.ts` files
- **Semicolons** in `<script setup>` blocks
- **No semicolons** in standalone `.ts` files

### Types & TypeScript
- `noUncheckedIndexedAccess: true` — always guard array/object access with `?.` or check
- Define component props: `defineProps<{ name: string; count: number }>()`
- Define emits: `defineEmits<{ click: [value: string] }>()`
- Define v-model: `defineModel<boolean>({ default: false })` or `defineModel<number>("index", { default: 0 })`
- Props with defaults: `withDefaults(defineProps<{ items: LightboxItem[] }>(), { items: () => [] })`
- Export interfaces with `interface` keyword, not `type`
- Local interfaces defined inside `<script setup>` before use
- Literal union types: `type: "portrait" | "landscape" | "square"`
- `Set` for validation: `VALID_TYPES = new Set(["portrait", "landscape", "square"])`
- Cast env vars: `import.meta.env.VITE_CONTENTFUL_SPACE as string`

### Naming
- **Files:** PascalCase for components (`GalleryItem.vue`), camelCase for utilities (`gallery.ts`)
- **Components:** PascalCase; use `defineOptions({ name: "MultiWordName" })` when filename is single-word
- **Stores:** `use<Name>Store` function, `defineStore('name', () => {...})`
- **Refs:** camelCase (`activeFilter`, `lightboxOpen`)
- **Functions:** camelCase (`openLightbox`, `setFilter`, `handleKeydown`)
- **Events/Slots:** kebab-case in templates (`@click`, `v-model`)
- **Test files:** `*.spec.ts` in `src/__tests__/`

### State Management (Pinia)
- Composition store syntax: `defineStore('name', () => { ... return { ... } })`
- Return all public refs, computed, and functions from the store
- Access store state with `.value` in script, no `.value` in templates

### Error Handling
- Use `e instanceof Error ? e.message : fallback` for caught errors
- Use silent catch (empty block) for non-critical operations (e.g. scroll-triggered loads)
- Validate untrusted data with helper functions (`validateType`, `getAltText`)

### Comments
- `/** JSDoc */` for exported interfaces, functions, complex logic, and `defineOptions` rationale
- Inline comments for non-obvious behavior (e.g. modulo wrapping, `silent fail for scroll-triggered loads`)
- Keep comments concise; prefer self-documenting code

### Testing (Vitest + Vue Test Utils)
- `import { describe, it, expect, vi, beforeEach } from 'vitest'`
- `import { mount } from '@vue/test-utils'`
- Set up Pinia per test: `setActivePinia(createPinia())`
- One `describe` block per component/store/service, `it` for individual behaviors
- Use `as any` cast on component mount for TypeScript compatibility: `mount(Lightbox as any, { props: ... })`
- Mock with `vi.mock('@/services/contentful', () => ({ fetchPhotos: vi.fn() }))`
- Always add type params to `vi.fn<>()` — enforced by lint
- Use `function` keyword (not arrow) for constructible mocks (`new IntersectionObserver(...)`)
- Mock globals with `vi.stubGlobal()` and restore with `vi.unstubAllGlobals()`
- Use `vi.mocked(mockFn).mockResolvedValue(...)` in test bodies
- Reset mocks in `beforeEach`: `vi.clearAllMocks()`

### Linting & Formatting
- ESLint 10 (flat config in `eslint.config.ts`) + oxlint 1.60
- oxlint plugins: eslint, typescript, unicorn, oxc, vue, vitest
- Indent: 2 spaces (EditorConfig)
- Max line length: 100
- LF line endings, UTF-8, trailing newline
- Trim trailing whitespace
- `source.fixAll` runs on save in VSCode
- Recommended extensions: Volar, Vitest Explorer, ESLint, EditorConfig, oxc

### TailwindCSS
- Use `@theme` block in `style.css` for design tokens (`--color-*`, `--spacing-*`, `--radius-*`)
- Use `@utility` for custom utility classes (`text-headline-xl`, `font-label-sm`, `material-symbols-outlined`)
- Use `material-symbols-outlined` utility for icon font
- Responsive: `md:` breakpoint prefix; mobile-first

### Component Patterns
- `defineOptions({ name: "MultiWordName" })` for single-word filenames (lints `vue/multi-word-component-names`)
- Store lifecycle: `onMounted` / `onUnmounted` for event listeners (clean up always)
- `watch` with `{ deep: true }` when reacting to array mutations
- `nextTick` from vue when DOM needs updating after reactive changes
- `v-for` with `:key` on unique `item.id`
- Default slot content for empty states
- `TransitionGroup` for list animations (filtering)
- `Transition` for overlay animations (lightbox)
- `document.body.style.overflow` to lock body scroll (lightbox open)
- Avoid dead code: no commented-out imports, template elements, or components

### Contentful
- Content type: `gallery` with fields `location`, `alt` (Rich Text), `date`, `type`, `category`, `src` (Media)
- Pagination: `limit=9`, `skip`, ordered by `-fields.date`
- Image URLs prefixed with `https:` (Contentful returns protocol-relative)

### Env Variables
- All env vars prefixed with `VITE_` (Vite convention)
- Required: `VITE_CONTENTFUL_SPACE`, `VITE_CONTENTFUL_ACCESS_TOKEN`
- Reference via `import.meta.env.VITE_*`

## Agent skills

### Issue tracker

Issues and specs for this repo live in GitHub Issues; use the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the default canonical triage labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, and `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

This is a single-context repo: read root `CONTEXT.md` and applicable ADRs in `docs/adr/`. See `docs/agents/domain.md`.
