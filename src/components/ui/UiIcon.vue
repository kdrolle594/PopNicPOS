<script setup>
const props = defineProps({
  name: { type: String, required: true },
  size: { type: Number, default: 18 },
});

// Each entry is the inner markup of a 24x24 stroked icon.
// v-html renders only this hardcoded constant — never user input.
const PATHS = {
  // ── Migrated from App.vue ICONS ────────────────────────────
  dashboard:
    '<rect x="3" y="3" width="7" height="7" rx="1"/>' +
    '<rect x="14" y="3" width="7" height="7" rx="1"/>' +
    '<rect x="3" y="14" width="7" height="7" rx="1"/>' +
    '<rect x="14" y="14" width="7" height="7" rx="1"/>',
  pos:
    '<circle cx="8" cy="21" r="1"/>' +
    '<circle cx="19" cy="21" r="1"/>' +
    '<path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/>',
  kitchen:
    '<path d="M6 13.87A4 4 0 0 1 7.41 6a5.11 5.11 0 0 1 1.05-1.54 5 5 0 0 1 7.08 0A5.11 5.11 0 0 1 16.59 6 4 4 0 0 1 18 13.87V21H6Z"/>' +
    '<line x1="6" y1="17" x2="18" y2="17"/>',
  inventory:
    '<path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/>' +
    '<path d="m3.3 7 8.7 5 8.7-5"/>' +
    '<path d="M12 22V12"/>',
  menu:
    '<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/>' +
    '<path d="M7 2v20"/>' +
    '<path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/>',
  loyalty:
    '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  analytics:
    '<line x1="18" y1="20" x2="18" y2="10"/>' +
    '<line x1="12" y1="20" x2="12" y2="4"/>' +
    '<line x1="6" y1="20" x2="6" y2="14"/>',
  customer:
    '<rect x="1" y="3" width="15" height="13" rx="1"/>' +
    '<polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/>' +
    '<circle cx="5.5" cy="18.5" r="2.5"/>' +
    '<circle cx="18.5" cy="18.5" r="2.5"/>',
  driver:
    '<path d="M5 17H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l3 4v10h-2"/>' +
    '<circle cx="7" cy="17" r="2"/>' +
    '<circle cx="17" cy="17" r="2"/>' +
    '<polyline points="12 11 12 5 18 11 12 11"/>',
  users:
    '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>' +
    '<circle cx="9" cy="7" r="4"/>' +
    '<path d="M23 21v-2a4 4 0 0 0-3-3.87"/>' +
    '<path d="M16 3.13a4 4 0 0 1 0 7.75"/>',

  // ── Additional icons ────────────────────────────────────────
  cart:
    '<circle cx="8" cy="21" r="1"/>' +
    '<circle cx="19" cy="21" r="1"/>' +
    '<path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/>',
  plus:
    '<line x1="12" y1="5" x2="12" y2="19"/>' +
    '<line x1="5" y1="12" x2="19" y2="12"/>',
  minus:
    '<line x1="5" y1="12" x2="19" y2="12"/>',
  close:
    '<line x1="18" y1="6" x2="6" y2="18"/>' +
    '<line x1="6" y1="6" x2="18" y2="18"/>',
  check:
    '<polyline points="20 6 9 17 4 12"/>',
  'chevron-right':
    '<polyline points="9 18 15 12 9 6"/>',
  'chevron-left':
    '<polyline points="15 18 9 12 15 6"/>',
  search:
    '<circle cx="11" cy="11" r="8"/>' +
    '<line x1="21" y1="21" x2="16.65" y2="16.65"/>',
  signout:
    '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>' +
    '<polyline points="16 17 21 12 16 7"/>' +
    '<line x1="21" y1="12" x2="9" y2="12"/>',
  location:
    '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>' +
    '<circle cx="12" cy="10" r="3"/>',
  clock:
    '<circle cx="12" cy="12" r="10"/>' +
    '<polyline points="12 6 12 12 16 14"/>',
  alert:
    '<circle cx="12" cy="12" r="10"/>' +
    '<line x1="12" y1="8" x2="12" y2="12"/>' +
    '<line x1="12" y1="16" x2="12.01" y2="16"/>',
};
</script>

<template>
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.75"
    stroke-linecap="round"
    stroke-linejoin="round"
    :width="props.size"
    :height="props.size"
    aria-hidden="true"
    focusable="false"
    v-html="PATHS[props.name] || ''"
  />
</template>
