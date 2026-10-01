import { ref, watch, onUnmounted } from 'vue';

const POST_EVERY_MS = 10_000;

// Watches GPS for as long as the component lives. While `active` is true it
// sends the latest fix every 10 s and holds a screen wake lock.
export function useLocationSharing(active, send) {
  const fix = ref(null);
  const permission = ref('unknown');
  const error = ref('');
  const lastSentAt = ref(null);

  let watchId = null;
  let timer = null;
  let wakeLock = null;
  let wakeLockPending = false;
  let lastAttemptAt = null;
  let sending = false;

  if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
    permission.value = 'unsupported';
  } else {
    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        fix.value = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        permission.value = 'granted';
        error.value = '';
        if (active.value && lastAttemptAt == null) sendNow();
      },
      (err) => {
        if (err.code === 1) permission.value = 'denied';
        error.value = err.message || 'Location unavailable';
      },
      { enableHighAccuracy: true, maximumAge: 5000 }
    );
  }

  async function sendNow() {
    if (!fix.value || sending) return;
    sending = true;
    lastAttemptAt = Date.now();
    try {
      await send(fix.value);
      lastSentAt.value = Date.now();
    } catch (err) {
      error.value = err.message || 'Could not share location';
    } finally {
      sending = false;
    }
  }

  async function requestWakeLock() {
    if (!('wakeLock' in navigator) || wakeLock || wakeLockPending) return;
    wakeLockPending = true;
    try {
      const lock = await navigator.wakeLock.request('screen');
      if (!active.value || !timer) {
        // Sharing stopped while the request was in flight.
        lock.release().catch(() => {});
        return;
      }
      wakeLock = lock;
      lock.addEventListener('release', () => { if (wakeLock === lock) wakeLock = null; });
    } catch {
      // Unsupported or refused — sharing still works while the screen is on.
    } finally {
      wakeLockPending = false;
    }
  }

  function onVisible() {
    if (document.visibilityState === 'visible' && active.value) {
      requestWakeLock();
      sendNow();
    }
  }

  function start() {
    if (timer) return;
    sendNow();
    timer = setInterval(sendNow, POST_EVERY_MS);
    requestWakeLock();
    document.addEventListener('visibilitychange', onVisible);
  }

  function pause() {
    clearInterval(timer);
    timer = null;
    lastSentAt.value = null;
    lastAttemptAt = null;
    document.removeEventListener('visibilitychange', onVisible);
    if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
  }

  function stop() {
    pause();
    if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }

  watch(active, (on) => (on ? start() : pause()), { immediate: true });
  onUnmounted(stop);

  return { fix, permission, error, lastSentAt, stop };
}
