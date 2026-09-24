<script>
let fieldCounter = 0;
</script>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  label:    { type: String,  required: true },
  hint:     { type: String,  default: undefined },
  error:    { type: String,  default: undefined },
  required: { type: Boolean, default: false },
  id:       { type: String,  default: undefined },
});

// Generate stable id: prefer caller-provided, else auto-generate once
const resolvedId = props.id ?? `ui-field-${++fieldCounter}`;

const hintId    = `${resolvedId}-hint`;
const errorId   = `${resolvedId}-error`;

const describedBy = computed(() => {
  if (props.error) return errorId;
  if (props.hint)  return hintId;
  return undefined;
});

const invalid = computed(() => !!props.error);
</script>

<template>
  <div class="field">
    <label :for="resolvedId" class="field-label">
      {{ label }}
      <span v-if="required" class="field-required" aria-hidden="true">*</span>
    </label>

    <slot :id="resolvedId" :describedBy="describedBy" :invalid="invalid" />

    <p v-if="hint && !error" :id="hintId" class="field-hint">{{ hint }}</p>
    <p v-if="error"          :id="errorId" class="field-error" role="alert">{{ error }}</p>
  </div>
</template>

<style scoped>
.field {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.field-label {
  font-size: var(--text-body);
  font-weight: var(--weight-medium);
  color: var(--ink);
}

.field-required {
  color: var(--danger);
  margin-left: var(--space-1);
}

.field-hint {
  margin: 0;
  font-size: var(--text-caption);
  color: var(--ink-muted);
}

.field-error {
  margin: 0;
  font-size: var(--text-caption);
  color: var(--danger);
}
</style>
