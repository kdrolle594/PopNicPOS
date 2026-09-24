<script setup>
defineProps({
  interactive: Boolean,
  padded:      { type: Boolean, default: true },
});
</script>

<template>
  <div
    class="ui-card"
    :class="{
      'ui-card--interactive': interactive,
      'ui-card--padded': padded,
    }"
  >
    <div v-if="$slots.header" class="ui-card__header">
      <slot name="header" />
    </div>

    <div class="ui-card__body">
      <slot />
    </div>

    <div v-if="$slots.footer" class="ui-card__footer">
      <slot name="footer" />
    </div>
  </div>
</template>

<style scoped>
.ui-card {
  background: var(--surface-raised);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  overflow: hidden;
  transition:
    box-shadow var(--motion-fast) var(--ease),
    transform  var(--motion-fast) var(--ease);
}

.ui-card--padded .ui-card__body { padding: var(--card-pad, 20px); }
.ui-card--padded .ui-card__header { padding: var(--card-pad, 20px) var(--card-pad, 20px) 0; }
.ui-card--padded .ui-card__footer { padding: 0 var(--card-pad, 20px) var(--card-pad, 20px); }

.ui-card--interactive {
  cursor: pointer;
}
.ui-card--interactive:hover {
  box-shadow: var(--elev-1);
  transform: translateY(-1px);
}

.ui-card__header {
  border-bottom: 1px solid var(--line);
  padding-bottom: var(--space-4);
}

.ui-card__footer {
  border-top: 1px solid var(--line);
  padding-top: var(--space-4);
}
</style>
