import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

async function freshStore() {
  vi.resetModules();
  const mod = await import('../src/store/usePosStore.js');
  return mod.usePosStore();
}

beforeEach(() => {
  vi.useFakeTimers();
  globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => [{ id: 1, name: 'Soda' }] }));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('refreshMenu', () => {
  it('coalesces bursts of refreshes into one request', async () => {
    const store = await freshStore();
    const done = Promise.all([store.refreshMenu(), store.refreshMenu(), store.refreshMenu()]);
    await vi.advanceTimersByTimeAsync(300);
    await done;
    const menuCalls = globalThis.fetch.mock.calls.filter(([url]) => String(url).endsWith('/api/menu-items'));
    expect(menuCalls).toHaveLength(1);
    expect(store.state.menuItems).toEqual([{ id: 1, name: 'Soda' }]);
  });
});
