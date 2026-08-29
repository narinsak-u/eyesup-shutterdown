<script setup lang="ts">
import { computed, nextTick, onUnmounted, shallowRef, useTemplateRef, watch } from "vue";

import { createAnonymousIdentity, discoverPublicIp, hashIp } from "@/services/anonymousIdentity";
import {
  createComment,
  createLike,
  deleteLike,
  fetchInteractionSummary,
} from "@/services/interactions";
import type { AnonymousIdentity } from "@/services/anonymousIdentity";
import type { InteractionComment, InteractionSummary } from "@/types/interactions";
import type { Photo } from "@/types/gallery";

defineOptions({ name: "GalleryLightbox" });

/** Fullscreen image viewer with previous/next navigation and an interaction panel. */
const props = withDefaults(defineProps<{ items: Photo[] }>(), {
  items: () => [],
});

/** Controls whether the lightbox is open or closed. Bidirectional binding with parent. */
const isOpen = defineModel<boolean>({ default: false });

/** Currently selected image index in the items array. Bidirectional binding with parent. */
const index = defineModel<number>("index", { default: 0 });

const currentPhoto = computed(() => props.items[index.value]);
const currentSrc = computed(() => currentPhoto.value?.src ?? "");
const currentPhotoId = computed(() => currentPhoto.value?.id);

const summary = shallowRef<InteractionSummary | null>(null);
const comments = shallowRef<InteractionComment[]>([]);
const commentDraft = shallowRef("");
const identity = shallowRef<AnonymousIdentity | null>(null);
const loadingInteractions = shallowRef(false);
const loadingMoreComments = shallowRef(false);
const likePending = shallowRef(false);
const commentPending = shallowRef(false);
const interactionError = shallowRef<string | null>(null);

let interactionRequestId = 0;
let likeRequestId = 0;
let commentRequestId = 0;
let loadedCommentCount = 0;
let likeEntryId: string | null = null;
let identityPromise: Promise<AnonymousIdentity> | null = null;
let previousBodyOverflow: string | null = null;
let wasOpen = false;
let openerElement: HTMLElement | null = null;

const dialogRef = useTemplateRef<HTMLDivElement>("dialog");

const hasMoreComments = computed(() => summary.value?.hasMoreComments ?? false);
const commentCount = computed(() => comments.value.length);

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function isCurrentPhoto(photoId: string): boolean {
  return isOpen.value && currentPhotoId.value === photoId;
}

function invalidateWriteRequests(): void {
  likeRequestId += 1;
  commentRequestId += 1;
  likePending.value = false;
  commentPending.value = false;
}

function resetInteractionState(): void {
  invalidateWriteRequests();
  summary.value = null;
  comments.value = [];
  commentDraft.value = "";
  interactionError.value = null;
  loadingInteractions.value = false;
  loadingMoreComments.value = false;
  loadedCommentCount = 0;
  likeEntryId = null;
}

async function resolveIdentity(): Promise<AnonymousIdentity> {
  if (identity.value) return identity.value;

  if (!identityPromise) {
    const promise = (async () => {
      const ip = await discoverPublicIp(import.meta.env.VITE_IP_DISCOVERY_URL as string);
      const ipHash = await hashIp(ip);
      return createAnonymousIdentity(ipHash);
    })();
    identityPromise = promise;
    void promise.then(
      () => {
        if (identityPromise === promise) identityPromise = null;
      },
      () => {
        if (identityPromise === promise) identityPromise = null;
      },
    );
  }

  const pendingIdentity = identityPromise;
  if (!pendingIdentity) throw new Error("Could not create an anonymous identity.");
  const resolvedIdentity = await pendingIdentity;
  identity.value = resolvedIdentity;
  return resolvedIdentity;
}

async function loadInteractions(photo: Photo): Promise<void> {
  const requestId = ++interactionRequestId;
  const photoId = photo.id;
  resetInteractionState();
  loadingInteractions.value = true;

  try {
    const viewer = await resolveIdentity();
    const fetchedSummary = await fetchInteractionSummary(photoId, viewer.ipHash);
    if (requestId !== interactionRequestId || !isCurrentPhoto(photoId)) return;

    summary.value = fetchedSummary;
    comments.value = fetchedSummary.comments;
    loadedCommentCount = fetchedSummary.comments.length;
    likeEntryId = fetchedSummary.viewerLikeId ?? null;
  } catch (error) {
    if (requestId === interactionRequestId && isCurrentPhoto(photoId)) {
      interactionError.value = errorMessage(error, "Could not load this post's interactions.");
    }
  } finally {
    if (requestId === interactionRequestId && isCurrentPhoto(photoId)) {
      loadingInteractions.value = false;
    }
  }
}

async function loadMoreComments(): Promise<void> {
  const photo = currentPhoto.value;
  const viewer = identity.value;
  if (
    !photo ||
    !viewer ||
    !summary.value ||
    !hasMoreComments.value ||
    loadingMoreComments.value
  ) {
    return;
  }

  const photoId = photo.id;
  const requestId = interactionRequestId;
  loadingMoreComments.value = true;
  interactionError.value = null;

  try {
    const page = await fetchInteractionSummary(photoId, viewer.ipHash, loadedCommentCount);
    if (requestId !== interactionRequestId || !isCurrentPhoto(photoId)) return;

    comments.value = [...comments.value, ...page.comments];
    loadedCommentCount += page.comments.length;
    summary.value = {
      ...summary.value,
      comments: comments.value,
      hasMoreComments: page.hasMoreComments,
    };
  } catch (error) {
    if (requestId === interactionRequestId && isCurrentPhoto(photoId)) {
      interactionError.value = errorMessage(error, "Could not load more comments.");
    }
  } finally {
    if (requestId === interactionRequestId && isCurrentPhoto(photoId)) {
      loadingMoreComments.value = false;
    }
  }
}

async function toggleLike(): Promise<void> {
  const photo = currentPhoto.value;
  const viewer = identity.value;
  const currentSummary = summary.value;
  if (!photo || !viewer || !currentSummary || likePending.value) return;

  const photoId = photo.id;
  const requestId = ++likeRequestId;
  const wasLiked = currentSummary.likedByViewer;
  const previousLikeCount = currentSummary.likeCount;
  const previousLikeEntryId = likeEntryId;
  const nextLiked = !wasLiked;
  summary.value = {
    ...currentSummary,
    likeCount: Math.max(0, previousLikeCount + (nextLiked ? 1 : -1)),
    likedByViewer: nextLiked,
  };
  interactionError.value = null;
  likePending.value = true;

  try {
    if (nextLiked) {
      const createdLikeId = await createLike(photoId, viewer.ipHash);
      if (requestId !== likeRequestId || !isCurrentPhoto(photoId)) return;
      likeEntryId = createdLikeId;
    } else if (previousLikeEntryId) {
      await deleteLike(previousLikeEntryId);
      if (requestId !== likeRequestId || !isCurrentPhoto(photoId)) return;
      likeEntryId = null;
    } else {
      throw new Error("The existing like could not be identified.");
    }
  } catch (error) {
    if (requestId === likeRequestId && isCurrentPhoto(photoId) && summary.value) {
      summary.value = {
        ...summary.value,
        likeCount: previousLikeCount,
        likedByViewer: wasLiked,
      };
      likeEntryId = previousLikeEntryId;
      interactionError.value = errorMessage(error, "Could not update your like.");
    }
  } finally {
    if (requestId === likeRequestId && isCurrentPhoto(photoId)) likePending.value = false;
  }
}

async function submitComment(): Promise<void> {
  const photo = currentPhoto.value;
  const viewer = identity.value;
  if (!photo || !viewer || commentPending.value) return;

  const draft = commentDraft.value;
  const text = draft.trim();
  if (!text) {
    interactionError.value = "Enter a comment before posting.";
    return;
  }
  if (text.length > 500) {
    interactionError.value = "Comments must be 500 characters or fewer.";
    return;
  }

  const photoId = photo.id;
  const requestId = ++commentRequestId;
  const provisionalId = `pending-${requestId}`;
  const provisionalComment: InteractionComment = {
    id: provisionalId,
    photoId,
    ipHash: viewer.ipHash,
    text,
    createdAt: new Date().toISOString(),
    status: "pending",
  };

  comments.value = [provisionalComment, ...comments.value];
  commentDraft.value = "";
  interactionError.value = null;
  commentPending.value = true;

  try {
    const createdComment = await createComment(photoId, viewer.ipHash, text);
    if (requestId !== commentRequestId || !isCurrentPhoto(photoId)) return;
    comments.value = comments.value.map((comment) =>
      comment.id === provisionalId ? createdComment : comment,
    );
    if (summary.value) summary.value = { ...summary.value, comments: comments.value };
  } catch (error) {
    if (requestId === commentRequestId && isCurrentPhoto(photoId)) {
      comments.value = comments.value.filter((comment) => comment.id !== provisionalId);
      commentDraft.value = draft;
      interactionError.value = errorMessage(error, "Could not post your comment.");
      if (summary.value) summary.value = { ...summary.value, comments: comments.value };
    }
  } finally {
    if (requestId === commentRequestId && isCurrentPhoto(photoId)) commentPending.value = false;
  }
}
/** Advances to the next image, wrapping around at the end of the collection. */
function next() {
  if (props.items.length === 0) return;
  index.value = (index.value + 1) % props.items.length;
}

/** Goes to the previous image, wrapping around at the beginning of the collection. */
function prev() {
  if (props.items.length === 0) return;
  index.value = (index.value - 1 + props.items.length) % props.items.length;
}

const close = () => {
  invalidateWriteRequests();
  interactionRequestId += 1;
  isOpen.value = false;
};

function getFocusableElements(): HTMLElement[] {
  const dialog = dialogRef.value;
  if (!dialog) return [];

  return Array.from(
    dialog.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  );
}

function focusFirstElement(): void {
  getFocusableElements()[0]?.focus();
}

function handleFocusIn(event: FocusEvent): void {
  const dialog = dialogRef.value;
  if (!isOpen.value || !dialog) return;
  const target = event.target;
  if (!(target instanceof Node) || !dialog.contains(target)) focusFirstElement();
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") {
    close();
    return;
  }

  if (event.key === "Tab") {
    const dialog = dialogRef.value;
    const focusable = getFocusableElements();
    if (!dialog || focusable.length === 0) {
      event.preventDefault();
      return;
    }

    const activeElement = document.activeElement;
    const activeIndex = activeElement instanceof HTMLElement ? focusable.indexOf(activeElement) : -1;
    if (!dialog.contains(activeElement) || activeIndex === -1) {
      event.preventDefault();
      focusable[0]?.focus();
      return;
    }

    if (event.shiftKey && activeIndex === 0) {
      event.preventDefault();
      focusable.at(-1)?.focus();
    } else if (!event.shiftKey && activeIndex === focusable.length - 1) {
      event.preventDefault();
      focusable[0]?.focus();
    }
    return;
  }

  const target = event.target;
  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  ) {
    return;
  }
  if (event.key === "ArrowLeft") prev();
  else if (event.key === "ArrowRight") next();
}

function rememberOpener(): void {
  const activeElement = document.activeElement;
  openerElement =
    activeElement instanceof HTMLElement && activeElement !== document.body ? activeElement : null;
}

function restoreFocus(): void {
  const opener = openerElement;
  openerElement = null;
  if (opener && document.contains(opener)) void nextTick(() => opener.focus());
}

function lockBodyScroll(): void {
  if (previousBodyOverflow !== null) return;
  previousBodyOverflow = document.body.style.overflow;
  document.body.style.overflow = "hidden";
}

function restoreBodyScroll(): void {
  if (previousBodyOverflow === null) return;
  document.body.style.overflow = previousBodyOverflow;
  previousBodyOverflow = null;
}

watch(
  [isOpen, currentPhotoId],
  ([open, photoId]) => {
    if (open) {
      if (!wasOpen) {
        rememberOpener();
        wasOpen = true;
        void nextTick(focusFirstElement);
      }
      lockBodyScroll();
      window.addEventListener("keydown", handleKeydown);
      document.addEventListener("focusin", handleFocusIn);
      if (photoId && currentPhoto.value) void loadInteractions(currentPhoto.value);
    } else {
      window.removeEventListener("keydown", handleKeydown);
      document.removeEventListener("focusin", handleFocusIn);
      invalidateWriteRequests();
      interactionRequestId += 1;
      restoreBodyScroll();
      if (wasOpen) {
        wasOpen = false;
        restoreFocus();
      }
    }
  },
  { immediate: true },
);

onUnmounted(() => {
  invalidateWriteRequests();
  interactionRequestId += 1;
  window.removeEventListener("keydown", handleKeydown);
  document.removeEventListener("focusin", handleFocusIn);
  restoreBodyScroll();
  if (wasOpen) {
    wasOpen = false;
    restoreFocus();
  }
});
</script>

<template>
  <Transition name="lightbox">
    <div
      v-if="isOpen"
      ref="dialog"
      tabindex="-1"
      class="fixed inset-0 z-100 flex items-center justify-center overflow-y-auto bg-black/70 p-2 md:p-8"
      role="dialog"
      aria-modal="true"
      aria-labelledby="lightbox-title"
      :data-photo-id="currentPhoto?.id"
    >
      <div
        class="relative flex min-h-[min(90vh,680px)] w-full max-w-6xl flex-col overflow-hidden rounded-sm bg-white shadow-2xl md:max-h-[calc(100vh-4rem)] md:min-h-0 md:flex-row"
      >
        <button
          class="absolute right-3 top-3 z-20 cursor-pointer rounded-full bg-white/90 p-2 text-primary transition-opacity duration-200 hover:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary md:right-5 md:top-5"
          type="button"
          aria-label="Close lightbox"
          @click="close"
        >
          <span class="material-symbols-outlined" aria-hidden="true">close</span>
        </button>

        <button
          v-if="items.length > 1"
          class="absolute left-3 top-1/2 z-20 -translate-y-1/2 cursor-pointer rounded-full bg-white/90 p-2 text-primary transition-opacity duration-200 hover:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary md:left-5"
          type="button"
          aria-label="Previous image"
          @click="prev"
        >
          <span class="material-symbols-outlined" aria-hidden="true">chevron_left</span>
        </button>

        <section class="flex min-h-[35vh] flex-1 items-center justify-center bg-black md:min-h-0 md:w-3/5 md:flex-none">
          <img
            :src="currentSrc"
            class="max-h-[55vh] w-full object-contain md:max-h-[calc(100vh-4rem)]"
            :alt="currentPhoto?.alt || 'Expanded gallery image'"
          />
        </section>

        <button
          v-if="items.length > 1"
          class="absolute right-3 top-1/2 z-20 -translate-y-1/2 cursor-pointer rounded-full bg-white/90 p-2 text-primary transition-opacity duration-200 hover:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary md:right-[42%]"
          type="button"
          aria-label="Next image"
          @click="next"
        >
          <span class="material-symbols-outlined" aria-hidden="true">chevron_right</span>
        </button>

        <aside class="flex min-h-0 flex-1 flex-col bg-white md:w-2/5 md:flex-none">
          <header class="flex shrink-0 items-center gap-3 border-b border-gray-200 px-5 py-4" id="lightbox-title">
            <img
              v-if="identity"
              :src="identity.avatarUrl"
              alt=""
              class="h-9 w-9 rounded-full border border-gray-200"
            />
            <div class="min-w-0">
              <p class="truncate text-label-sm font-label-sm text-primary">eyesup_gallery</p>
              <p v-if="identity" class="truncate text-body-sm text-secondary">{{ identity.username }}</p>
              <p v-else class="text-body-sm text-secondary">Anonymous viewer</p>
            </div>
          </header>

          <div class="flex min-h-0 flex-1 flex-col px-5 py-4">
            <div class="shrink-0 border-b border-gray-200 pb-4">
              <p v-if="currentPhoto?.alt" class="text-body-md text-primary">{{ currentPhoto.alt }}</p>
              <p class="mt-2 text-body-sm text-secondary">
                <span>{{ currentPhoto?.location }}</span>
                <span aria-hidden="true"> · </span>
                <time>{{ currentPhoto?.date }}</time>
              </p>
            </div>

            <div
              class="flex min-h-0 flex-1 flex-col overflow-y-auto py-4"
              role="region"
              aria-label="Comments"
              aria-live="polite"
            >
              <p v-if="loadingInteractions" class="py-6 text-body-sm text-secondary" role="status">
                Loading interactions…
              </p>
              <p v-else-if="!identity && interactionError" class="py-6 text-body-sm text-secondary">
                Comments are unavailable until an anonymous identity can be created.
              </p>
              <p v-else-if="!loadingInteractions && comments.length === 0" class="py-6 text-body-sm text-secondary">
                No comments yet.
              </p>

              <ul v-else class="space-y-4">
                <li v-for="comment in comments" :key="comment.id" class="flex gap-3">
                  <div class="min-w-0">
                    <p class="text-body-sm text-secondary">
                      <span class="font-semibold text-primary">{{ comment.status === "pending" ? "You" : "Visitor" }}</span>
                      <span aria-hidden="true"> · </span>
                      <span v-if='comment.status === "pending"'>Posting…</span>
                      <time v-else>{{ comment.createdAt }}</time>
                    </p>
                    <p class="break-words text-body-md text-primary">{{ comment.text }}</p>
                  </div>
                </li>
              </ul>

              <button
                v-if="hasMoreComments"
                class="mt-5 self-start cursor-pointer text-label-sm text-secondary underline underline-offset-4 transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-wait disabled:opacity-50"
                type="button"
                :disabled="loadingMoreComments"
                @click="loadMoreComments"
              >
                {{ loadingMoreComments ? "Loading…" : "Load more" }}
              </button>
            </div>

            <div class="shrink-0 border-t border-gray-200 pt-4">
              <div class="flex items-center justify-between gap-4">
                <button
                  class="inline-flex cursor-pointer items-center gap-2 rounded-sm text-label-sm text-primary transition-opacity hover:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-wait disabled:opacity-50"
                  type="button"
                  :disabled="loadingInteractions || likePending || !identity || !summary"
                  :aria-pressed="summary?.likedByViewer ?? false"
                  :aria-busy="likePending"
                  :aria-label="summary?.likedByViewer ? 'Unlike photo' : 'Like photo'"
                  @click="toggleLike"
                >
                  <span class="material-symbols-outlined" aria-hidden="true">
                    {{ summary?.likedByViewer ? "favorite" : "favorite_border" }}
                  </span>
                  <span>{{ summary?.likeCount ?? 0 }} likes</span>
                </button>
                <span class="text-body-sm text-secondary" aria-live="polite">{{ commentCount }} comments</span>
              </div>

              <form class="mt-4 flex gap-2" @submit.prevent="submitComment">
                <label class="sr-only" for="lightbox-comment">Add a comment</label>
                <textarea
                  id="lightbox-comment"
                  v-model="commentDraft"
                  class="min-h-10 min-w-0 flex-1 resize-none rounded-sm border border-gray-300 px-3 py-2 text-body-sm text-primary outline-none focus:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:bg-gray-100"
                  name="comment"
                  maxlength="500"
                  rows="1"
                  placeholder="Add a comment…"
                  :disabled="loadingInteractions || commentPending || !identity || !summary"
                />
                <button
                  class="cursor-pointer rounded-sm bg-primary px-3 py-2 text-label-sm text-white transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50"
                  type="submit"
                  :disabled="loadingInteractions || commentPending || !identity || !summary"
                  :aria-busy="commentPending"
                >
                  {{ commentPending ? "Posting…" : "Post" }}
                </button>
              </form>
              <p class="mt-1 text-right text-body-sm text-secondary">{{ commentDraft.length }}/500</p>
            </div>
          </div>

          <p v-if="interactionError" class="shrink-0 border-t border-red-200 bg-red-50 px-5 py-3 text-body-sm text-red-800" role="alert" aria-live="assertive">
            {{ interactionError }}
          </p>
        </aside>
      </div>
    </div>
  </Transition>
</template>
