<script setup lang="ts">
import { computed, watch, onUnmounted } from "vue";
import type { Photo } from "@/types/gallery";

defineOptions({ name: "GalleryLightbox" });

/** Fullscreen image viewer with previous/next navigation and keyboard support. */
const props = withDefaults(defineProps<{ items: Photo[] }>(), {
  items: () => [],
});

/** Controls whether the lightbox is open or closed. Bidirectional binding with parent. */
const isOpen = defineModel<boolean>({ default: false });

/** Currently selected image index in the items array. Bidirectional binding with parent. */
const index = defineModel<number>("index", { default: 0 });

/** The complete photo selected by the current index, including interaction identity and metadata. */
const currentPhoto = computed(() => props.items[index.value]);

/** Returns the src URL of the currently displayed image, or empty string if index is out of bounds. */
const currentSrc = computed(() => currentPhoto.value?.src ?? "");

/** Advances to the next image. Wraps around to the first image at the end using modulo operator. */
function next() {
  if (props.items.length === 0) return;
  index.value = (index.value + 1) % props.items.length;
}

/** Goes to the previous image. Wraps around to the last image at the beginning using modulo operator. */
function prev() {
  if (props.items.length === 0) return;
  index.value = (index.value - 1 + props.items.length) % props.items.length;
}

const close = () => {
  isOpen.value = false;
};

function handleKeydown(e: KeyboardEvent) {
  if (e.key === "ArrowLeft") prev();
  else if (e.key === "ArrowRight") next();
  else if (e.key === "Escape") close();
}

watch(isOpen, (newValue) => {
  if (newValue) {
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeydown);
  } else {
    document.body.style.overflow = "auto";
    window.removeEventListener("keydown", handleKeydown);
  }
});

onUnmounted(() => {
  window.removeEventListener("keydown", handleKeydown);
});
</script>

<template>
  <Transition name="lightbox">
    <div
      v-if="isOpen"
      :data-photo-id="currentPhoto?.id"
      class="fixed inset-0 bg-white z-100 flex items-center justify-center"
    >
      <button
        class="absolute top-6 cursor-pointer right-6 md:top-8 md:right-8 p-3 text-primary hover:opacity-60 transition-opacity duration-200 z-10"
        @click="close"
        aria-label="Close lightbox"
      >
        <span class="material-symbols-outlined text-3xl">close</span>
      </button>

      <button
        v-if="items.length > 1"
        class="absolute left-4 cursor-pointer md:left-8 top-1/2 -translate-y-1/2 p-3 text-primary hover:opacity-60 transition-opacity duration-200 z-10"
        @click="prev"
        aria-label="Previous image"
      >
        <span class="material-symbols-outlined text-3xl">chevron_left</span>
      </button>

      <img
        :src="currentSrc"
        class="max-h-full max-w-full object-contain p-container-margin-mobile md:p-container-margin-desktop"
        :alt="currentPhoto?.alt ?? 'Expanded gallery image'"
      />
      <div
        v-if="currentPhoto"
        class="absolute bottom-6 left-1/2 -translate-x-1/2 text-center text-primary"
      >
        <p class="text-label-sm font-label-sm">{{ currentPhoto.location }}</p>
        <time class="text-body-sm font-body-sm">{{ currentPhoto.date }}</time>
      </div>

      <button
        v-if="items.length > 1"
        class="absolute right-4 cursor-pointer md:right-8 top-1/2 -translate-y-1/2 p-3 text-primary hover:opacity-60 transition-opacity duration-200 z-10"
        @click="next"
        aria-label="Next image"
      >
        <span class="material-symbols-outlined text-3xl">chevron_right</span>
      </button>
    </div>
  </Transition>
</template>
