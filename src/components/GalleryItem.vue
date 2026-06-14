<script setup lang="ts">
/** A single photo card with image, location, and date. Emits `click` to open the lightbox. */
defineProps<{
  src: string;
  thumbSrc: string;
  alt: string;
  location: string;
  date: string;
  type: "portrait" | "landscape" | "square";
}>();

defineEmits<{ click: [] }>();
</script>

<template>
  <div
    class="gallery-item group relative cursor-pointer opacity-0 translate-y-8"
    @click="$emit('click')"
  >
      <img
        :src="thumbSrc"
        :alt="alt"
        class="w-full h-auto block image-zoom"
        loading="lazy"
        draggable="false"
      />
    <div class="pt-3 pb-2">
      <p class="text-label-md font-label-md text-primary">{{ location }}</p>
      <p class="text-label-sm font-label-sm text-secondary uppercase mt-1">{{ date }}</p>
    </div>
  </div>
</template>
