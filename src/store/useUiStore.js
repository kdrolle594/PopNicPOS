import { reactive } from 'vue';

let storeInstance;
let nextToastId = 1;

export function useUiStore() {
  if (storeInstance) return storeInstance;

  const state = reactive({ toasts: [] });

  function pushToast({ message, tone = 'info', timeout = 5000 }) {
    const id = nextToastId++;
    state.toasts = [...state.toasts, { id, message, tone }];
    if (timeout > 0) setTimeout(() => dismissToast(id), timeout);
    return id;
  }

  function dismissToast(id) {
    state.toasts = state.toasts.filter((t) => t.id !== id);
  }

  storeInstance = { state, pushToast, dismissToast };
  return storeInstance;
}
