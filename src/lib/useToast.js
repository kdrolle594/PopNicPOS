import { useUiStore } from '../store/useUiStore.js';

export function useToast() {
  const ui = useUiStore();
  return {
    success: (message) => ui.pushToast({ message, tone: 'positive' }),
    info:    (message) => ui.pushToast({ message, tone: 'info' }),
    // Errors persist until dismissed — they usually require the user to act.
    error:   (message) => ui.pushToast({ message, tone: 'danger', timeout: 0 }),
  };
}
