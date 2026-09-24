<script setup>
const props = defineProps({
  width:  { type: String, default: '100%' },
  height: { type: String, default: '1em' },
  radius: { type: String, default: undefined },
  circle: Boolean,
});
</script>

<template>
  <span
    class="ui-skeleton"
    :style="{
      width: circle ? height : width,
      height,
      borderRadius: circle ? '50%' : (radius ?? 'var(--radius-sm)'),
    }"
    aria-hidden="true"
  />
</template>

<style scoped>
.ui-skeleton {
  display: block;
  background: var(--skel-base);
  position: relative;
  overflow: hidden;
}

.ui-skeleton::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(
    90deg,
    transparent 0%,
    color-mix(in srgb, var(--line) 60%, var(--surface)) 50%,
    transparent 100%
  );
  animation: ui-skeleton-shimmer 1.4s ease-in-out infinite;
  transform: translateX(-100%);
}

@keyframes ui-skeleton-shimmer {
  to { transform: translateX(100%); }
}

/* Reduced-motion: stop shimmer, keep block */
@media (prefers-reduced-motion: reduce) {
  .ui-skeleton::after {
    animation: none;
  }
}
</style>
