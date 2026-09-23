// Minimal sessionStorage stub so the cart store can be tested without jsdom.
class MemoryStorage {
  constructor() { this.map = new Map(); }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) { this.map.set(k, String(v)); }
  removeItem(k) { this.map.delete(k); }
  clear() { this.map.clear(); }
}

globalThis.sessionStorage = new MemoryStorage();

// Swap in a storage that throws, to prove the cart degrades gracefully.
globalThis.__breakStorage = () => {
  globalThis.sessionStorage = {
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('blocked'); },
    removeItem() { throw new Error('blocked'); },
  };
};

globalThis.__restoreStorage = () => {
  globalThis.sessionStorage = new MemoryStorage();
};
