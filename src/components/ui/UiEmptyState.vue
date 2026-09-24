<script setup>
import UiIcon from './UiIcon.vue';

defineProps({
  icon:        { type: String, default: undefined },
  title:       { type: String, required: true },
  description: { type: String, default: undefined },
});
</script>

<template>
  <div class="ui-empty">
    <UiIcon v-if="icon" :name="icon" :size="32" class="ui-empty__icon" />
    <p class="ui-empty__title">{{ title }}</p>
    <p v-if="description" class="ui-empty__desc">{{ description }}</p>
    <div v-if="$slots.action" class="ui-empty__action">
      <slot name="action" />
    </div>
  </div>
</template>

<style scoped>
.ui-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-3);
  text-align: center;
  padding: var(--space-10) var(--space-6);
}

.ui-empty__icon {
  color: var(--ink-subtle);
}

.ui-empty__title {
  font-size: var(--text-h3);
  line-height: var(--leading-h3);
  font-weight: var(--weight-h3);
  color: var(--ink);
  margin: 0;
}

.ui-empty__desc {
  font-size: var(--text-small);
  line-height: var(--leading-small);
  color: var(--ink-muted);
  margin: 0;
  max-width: 36ch;
}

.ui-empty__action {
  margin-top: var(--space-2);
}
</style>
