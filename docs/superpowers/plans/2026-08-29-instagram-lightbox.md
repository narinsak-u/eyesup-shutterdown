# Instagram-Style Lightbox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an Instagram-style Lightbox with anonymous, Contentful-backed likes and comments while preserving existing gallery behavior.

**Architecture:** Keep the existing gallery Contentful client read-only. Add a focused interaction service that reads interaction entries through the dedicated interaction space and writes through the exposed interaction-space token using Contentful’s HTTP API. Keep IP discovery, Web Crypto hashing, deterministic identity, and avatar selection in small pure/testable utilities. `Lightbox.vue` owns selected-photo interaction state and delegates all Contentful/network work to the service.

**Tech Stack:** Vue 3 Composition API, TypeScript, Contentful Delivery SDK, Contentful Management HTTP API, Tailwind CSS v4, Vitest, Vue Test Utils, Web Crypto API.

## Global Constraints

- Follow the repository’s Vue `<script setup lang="ts">` and existing import/quote/semicolon conventions.
- Preserve Escape, ArrowLeft, ArrowRight, close behavior, and body scroll locking.
- Use the stable `Photo.id`; never associate interactions by image URL.
- Store only client-computed `ipHash`; never store raw IP in Contentful.
- Interaction writes use the dedicated interaction-space token; never reuse the gallery token.
- Comments are visible immediately, immutable, plain text, trimmed, and limited to 500 characters.
- Likes toggle one active record per `photoId + ipHash`.
- Load five comments initially; load older comments explicitly.
- Optimistic like and comment updates must roll back on failed writes.
- No share action.

---

### Task 1: Define interaction contracts and configuration

**Files:**
- Modify: `src/types/gallery.ts`
- Create: `src/types/interactions.ts`
- Modify: `env.d.ts`

**Interfaces:**
- `Lightbox` consumes `Photo` directly, avoiding a duplicate photo-facing interface.
- `InteractionComment` contains `{ id: string; photoId: string; ipHash: string; text: string; createdAt: string; status: "visible" | "pending" }`.
- `InteractionSummary` contains `{ likeCount: number; likedByViewer: boolean; comments: InteractionComment[]; hasMoreComments: boolean }`.
- `InteractionConfig` reads `VITE_INTERACTION_SPACE`, `VITE_INTERACTION_ENVIRONMENT`, `VITE_INTERACTION_ACCESS_TOKEN`, and `VITE_IP_DISCOVERY_URL`.

- [ ] Add the interaction interfaces with `interface` declarations and literal status types.
- [ ] Extend Vite’s `ImportMetaEnv` declarations for the four interaction variables.
- [ ] Update the Lightbox item contract without duplicating `Photo` fields unnecessarily.
- [ ] Run `npm run type-check`; expected result: existing code identifies every caller that must pass `id`, `location`, and `date`.

### Task 2: Implement identity and avatar utilities

**Files:**
- Create: `src/services/anonymousIdentity.ts`
- Create: `src/__tests__/anonymousIdentity.spec.ts`
- Create: `src/assets/avatars/mascot-01.svg` through `mascot-06.svg` (or equivalent static avatar assets)

**Interfaces:**
- `discoverPublicIp(endpoint: string): Promise<string>`
- `hashIp(ip: string, cryptoApi?: Crypto): Promise<string>`
- `createAnonymousIdentity(ipHash: string): AnonymousIdentity`
- `AnonymousIdentity` contains `{ ipHash: string; username: string; avatarUrl: string }`.

- [ ] Write tests for normalized SHA-256 output, deterministic username/avatar selection, stable selection for the same hash, and rejected/invalid IP responses.
- [ ] Implement IP discovery with an abort timeout, response validation, and `Error` messages suitable for the UI.
- [ ] Implement Web Crypto SHA-256 hashing as lowercase hexadecimal.
- [ ] Implement a deterministic seeded name generator from a fixed adjective/noun/number vocabulary.
- [ ] Add six simple pre-generated mascot assets inspired by the approved rounded mascot direction and select by the first hash bytes; do not construct an external avatar URL from the hash.
- [ ] Run `npx vitest run src/__tests__/anonymousIdentity.spec.ts`; expected result: PASS.

### Task 3: Implement Contentful interaction service

**Files:**
- Create: `src/services/interactions.ts`
- Create: `src/__tests__/interactions-service.spec.ts`

**Interfaces:**
- `fetchInteractionSummary(photoId: string, ipHash: string, skip = 0, limit = 5): Promise<InteractionSummary>`
- `createLike(photoId: string, ipHash: string): Promise<string>`
- `deleteLike(entryId: string): Promise<void>`
- `createComment(photoId: string, ipHash: string, text: string): Promise<InteractionComment>`

- [ ] Write mocked-fetch tests for query parameters, five-comment pagination, like lookup by `photoId` and `ipHash`, comment mapping, management-entry creation, and management-entry deletion.
- [ ] Create a Delivery API client with the dedicated interaction-space configuration, or use authenticated `fetch` consistently for both read and write paths; never import the gallery client token.
- [ ] Use Contentful CDA queries for visible comments and likes, ordered newest first for comments and constrained by `photoId`.
- [ ] Use the Contentful Management API HTTP shape for entry creation/deletion, including `X-Contentful-Content-Type` on creates and `publishedVersion`/version headers as required by the API response.
- [ ] Validate `photoId`, `ipHash`, and comment text before network requests; trim text and reject empty or over-500-character values.
- [ ] Return normalized interaction objects independent of Contentful response field wrappers.
- [ ] Run `npx vitest run src/__tests__/interactions-service.spec.ts`; expected result: PASS.

### Task 4: Pass complete photo data into Lightbox

**Files:**
- Modify: `src/components/Gallery.vue`
- Modify: `src/components/Lightbox.vue`
- Modify: `src/__tests__/Lightbox.spec.ts`

**Interfaces:**
- Lightbox receives `items: Photo[]` or an equivalent complete item interface, preserving `src`, `alt`, and `id`.

- [ ] Add a failing component test that verifies the selected post renders location and date, and that navigation retains the selected photo ID.
- [ ] Pass `galleryStore.filteredPhotos` to Lightbox if that is the current template source; preserve index semantics and existing open/close behavior.
- [ ] Replace the local two-field item interface with the shared photo-facing contract.
- [ ] Run the focused Lightbox tests; expected result: existing navigation tests remain PASS and the new metadata test passes.

### Task 5: Build the Instagram-style interaction panel

**Files:**
- Modify: `src/components/Lightbox.vue`
- Modify: `src/style.css` only if a reusable avatar/card utility is required

**Interfaces:**
- Lightbox-local state: `summary`, `comments`, `commentDraft`, `identity`, `loadingInteractions`, `loadingMoreComments`, `likePending`, `commentPending`, and `interactionError`.

- [ ] Write failing component tests for panel visibility, fixed account header, five-comment rendering, like toggle, comment input validation, optimistic `Posting…`, rollback, and “Load more”.
- [ ] Replace the fullscreen image-only template with an accessible modal/card: image region, interaction panel, close/navigation controls, comments region, live error/status text, like button, comment form, and metadata.
- [ ] Use labelled Material Symbols buttons for close, previous, next, and like; provide the comment form as the comment action. Omit share and bookmark actions.
- [ ] Keep image `alt`, location, alt caption, formatted date, live like count, and deterministic viewer identity visible without relying on color alone.
- [ ] Implement responsive side-by-side desktop layout and stacked mobile layout with a bounded comments scroll region.
- [ ] Resolve IP identity and fetch the current summary when opening or changing photos; reset stale request state when the selected photo changes.
- [ ] Implement optimistic like toggle with rollback to the previous count/state on failure.
- [ ] Implement optimistic comment insertion with `Posting…`, disable the submit action while pending, replace the provisional item on success, and restore the draft/remove the provisional item on failure.
- [ ] Preserve body overflow exactly across open/close/unmount, including restoration when the component is destroyed while open.
- [ ] Run `npx vitest run src/__tests__/Lightbox.spec.ts`; expected result: PASS.

### Task 6: Add configuration and integration coverage

**Files:**
- Modify: `.env.example` if present, otherwise create it only if repository convention supports examples
- Modify: `src/__tests__/GalleryItem.spec.ts` only if the complete photo contract requires it
- Modify: `src/__tests__/Lightbox.spec.ts`

- [ ] Document the interaction-space variables without adding real credentials.
- [ ] Add tests for navigation while interaction loading, failed IP discovery, failed summary loading, disabled controls during writes, failed optimistic like rollback, failed optimistic comment rollback, and comment pagination.
- [ ] Run `npx vitest run src/__tests__/Lightbox.spec.ts src/__tests__/interactions-service.spec.ts src/__tests__/anonymousIdentity.spec.ts`; expected result: PASS.

### Task 7: Verify the actual surface and quality

**Files:**
- No new files; review all changed files.

- [ ] Run `npm run test:unit`.
- [ ] Run `npm run type-check`.
- [ ] Run `npm run build-only`.
- [ ] Start the app with `npm run dev` and inspect the lightbox in a browser at desktop and mobile widths, exercising open, navigation, like, comment, failure feedback, and Load more states with configured test data.
- [ ] Run the applicable code review/quality checks and fix only issues introduced by this feature.
