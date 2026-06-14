<script setup lang="ts">
import { onMounted, onUnmounted, watch, nextTick, ref } from "vue";
import { useGalleryStore } from "@/stores/gallery";
import GalleryItem from "./GalleryItem.vue";
import Lightbox from "./Lightbox.vue";

defineOptions({ name: "GallerySection" });

/** Main gallery section: fetches photos, handles filtering, infinite scroll, and scroll-reveal animations. */
const galleryStore = useGalleryStore();
const categories = ["all", "Architecture", "Nature", "Portrait"];

const openPhoto = (index: number) => {
  galleryStore.lightboxIndex = index;
  galleryStore.lightboxOpen = true;
};

/** Reference to the sentinel element at the end of the gallery—used to trigger infinite scroll. */
const sentinelRef = ref<HTMLElement | null>(null);

/** IntersectionObserver instance for scroll-reveal animation on gallery items. */
let observer: IntersectionObserver | null = null;

/** IntersectionObserver instance for infinite scroll—detects when sentinel reaches viewport. */
let loadMoreObserver: IntersectionObserver | null = null;

/** Sets up infinite scroll: loads more photos when sentinel enters viewport with 200px margin. */
const setupLoadMore = () => {
  if (loadMoreObserver) loadMoreObserver.disconnect();
  const el = sentinelRef.value;
  if (!el) return;
  loadMoreObserver = new IntersectionObserver(
    ([entry]) => {
      if (entry?.isIntersecting && galleryStore.hasMore && !galleryStore.loadingMore) {
        galleryStore.loadMore();
      }
    },
    { rootMargin: "200px" },
  );
  loadMoreObserver.observe(el);
};

/** Sets up scroll-reveal animations: staggered fade-in and slide-up effect for gallery items as they enter viewport. */
const setupScrollReveal = () => {
  if (observer) observer.disconnect();

  observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry, index) => {
        if (entry.isIntersecting) {
          setTimeout(() => {
            const item = entry.target as HTMLElement;
            item.classList.remove("opacity-0", "translate-y-8");
            item.classList.add("opacity-100");
            item.style.transform = "translateY(0)";
          }, index * 100);
          observer?.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.1 },
  );

  const items = document.querySelectorAll(".gallery-item");
  items.forEach((item) => {
    observer?.observe(item);
  });
};

/** Initializes gallery on component mount: fetches photos and sets up scroll-reveal animations. */
onMounted(() => {
  galleryStore.fetchPhotos();
  setupScrollReveal();
});

/** Cleans up observers on component unmount to prevent memory leaks. */
onUnmounted(() => {
  if (observer) observer.disconnect();
  if (loadMoreObserver) loadMoreObserver.disconnect();
});

/** Watches filtered photos: re-runs scroll-reveal and infinite scroll setup when filter changes or photos load. */
watch(
  () => galleryStore.filteredPhotos,
  async () => {
    await nextTick();
    setupScrollReveal();
    setupLoadMore();
  },
  { deep: true },
);
</script>

<template>
  <main
    class="pt-20 pb-section-gap px-container-margin-mobile md:px-container-margin-desktop md:mx-10 min-h-screen"
  >
    <section class="mb-16 md:mb-20 max-w-2xl">
      <h2 class="text-headline-xl font-pacifico text-primary mb-6">Eyes up, shutter down. 📷</h2>
      <p class="text-body-md font-body-md text-secondary max-w-xl">
        Walk around, frame the shot, and immediately move on to the next thing without overthinking
        it.
      </p>
    </section>

    <nav class="flex items-center gap-8 mb-12 overflow-x-auto no-scrollbar">
      <button
        v-for="category in categories"
        :key="category"
        @click="galleryStore.setFilter(category)"
        :class="[
          'text-label-sm cursor-pointer font-label-sm whitespace-nowrap transition-all duration-200 ease-out pb-1',
          galleryStore.activeFilter === category
            ? 'text-primary border-b-2 border-primary'
            : 'text-secondary hover:text-primary',
        ]"
      >
        {{ category === "all" ? "All Work" : category }}
      </button>
    </nav>

    <p
      v-if="galleryStore.loading"
      class="text-center py-20 text-body-lg font-body-lg text-secondary"
    >
      Loading...
    </p>

    <div v-else-if="galleryStore.error" class="text-center py-20">
      <p class="text-body-lg font-body-lg text-red-500 mb-4">{{ galleryStore.error }}</p>
      <button
        class="text-label-sm font-label-sm text-primary underline cursor-pointer"
        @click="galleryStore.fetchPhotos()"
      >
        Retry
      </button>
    </div>

    <template v-if="!galleryStore.loading && !galleryStore.error">
      <TransitionGroup
        name="gallery"
        tag="div"
        class="masonry-grid"
        id="gallery"
        @enter="(el: Element) => el.classList.remove('opacity-0', 'translate-y-8')"
      >
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
      </TransitionGroup>

      <div v-if="galleryStore.filteredPhotos.length === 0" class="text-center py-20">
        <p class="text-sm font-semibold text-secondary">No time to shoot.</p>
      </div>

      <div ref="sentinelRef" v-if="galleryStore.hasMore" class="h-px" />

      <p
        v-if="galleryStore.loadingMore"
        class="text-center py-8 text-body-lg font-body-lg text-secondary"
      >
        Loading more...
      </p>
    </template>
  </main>

  <Lightbox
    v-model="galleryStore.lightboxOpen"
    :items="galleryStore.filteredPhotos"
    v-model:index="galleryStore.lightboxIndex"
  />
</template>
