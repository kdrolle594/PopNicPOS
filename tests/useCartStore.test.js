import { describe, it, expect, beforeEach, vi } from 'vitest';

// The store is a module-level singleton, so each test gets a fresh module.
async function freshStore() {
  vi.resetModules();
  const mod = await import('../src/store/useCartStore.js');
  return mod.useCartStore();
}

const MARGHERITA = { menuItemId: 1, name: 'Margherita', price: 12, options: {} };
const PEPPERONI_L = { menuItemId: 2, name: 'Pepperoni', price: 15, options: { pizzaSize: 'large' } };
const PEPPERONI_M = { menuItemId: 2, name: 'Pepperoni', price: 12, options: { pizzaSize: 'medium' } };

beforeEach(() => {
  globalThis.__restoreStorage();
});

describe('line identity', () => {
  it('increments quantity for an identical line', async () => {
    const cart = await freshStore();
    cart.addLine(MARGHERITA);
    cart.addLine(MARGHERITA);
    expect(cart.state.items).toHaveLength(1);
    expect(cart.state.items[0].quantity).toBe(2);
  });

  it('keeps the same item with different options as separate lines', async () => {
    const cart = await freshStore();
    cart.addLine(PEPPERONI_L);
    cart.addLine(PEPPERONI_M);
    expect(cart.state.items).toHaveLength(2);
  });

  it('treats topping order as irrelevant', async () => {
    const cart = await freshStore();
    cart.addLine({ ...MARGHERITA, options: { pizzaToppings: ['ham', 'bacon'] } });
    cart.addLine({ ...MARGHERITA, options: { pizzaToppings: ['bacon', 'ham'] } });
    expect(cart.state.items).toHaveLength(1);
  });
});

describe('totals', () => {
  it('sums price by quantity', async () => {
    const cart = await freshStore();
    cart.addLine(MARGHERITA);
    cart.addLine(MARGHERITA);
    cart.addLine(PEPPERONI_L);
    expect(cart.itemCount.value).toBe(3);
    expect(cart.total.value).toBe(39);
  });

  it('removes a line when quantity drops to zero', async () => {
    const cart = await freshStore();
    cart.addLine(MARGHERITA);
    cart.setQuantity(cart.state.items[0], 0);
    expect(cart.state.items).toHaveLength(0);
  });
});

describe('persistence across the auth redirect', () => {
  it('restores the cart in a new module instance', async () => {
    const first = await freshStore();
    first.addLine(MARGHERITA);
    first.state.phone = '5551234';
    first.beginCheckout();

    // Simulates the full page navigation Auth0 performs.
    const second = await freshStore();
    expect(second.state.items).toHaveLength(1);
    expect(second.state.phone).toBe('5551234');
    expect(second.consumePendingCheckout()).toBe(true);
  });

  it('consumes pendingCheckout exactly once', async () => {
    const first = await freshStore();
    first.beginCheckout();
    const second = await freshStore();
    expect(second.consumePendingCheckout()).toBe(true);
    expect(second.consumePendingCheckout()).toBe(false);
  });

  it('keeps the cart when login is abandoned', async () => {
    const first = await freshStore();
    first.addLine(MARGHERITA);
    first.beginCheckout();

    const second = await freshStore();
    second.consumePendingCheckout();          // guest never authenticated
    const third = await freshStore();
    expect(third.state.items).toHaveLength(1); // cart survives
    expect(third.state.pendingCheckout).toBe(false);
  });
});

describe('reconcileWithMenu', () => {
  it('drops deleted and unavailable items and reports them', async () => {
    const cart = await freshStore();
    cart.addLine(MARGHERITA);
    cart.addLine(PEPPERONI_L);
    const { removed } = cart.reconcileWithMenu([{ id: 1, available: true }]);
    expect(cart.state.items).toHaveLength(1);
    expect(removed).toEqual(['Pepperoni']);
  });

  it('keeps everything when the menu still has it', async () => {
    const cart = await freshStore();
    cart.addLine(MARGHERITA);
    const { removed } = cart.reconcileWithMenu([{ id: 1, available: true }]);
    expect(removed).toEqual([]);
    expect(cart.state.items).toHaveLength(1);
  });

  it('drops an item that is present but marked unavailable', async () => {
    const cart = await freshStore();
    cart.addLine(MARGHERITA);
    cart.addLine(PEPPERONI_L);
    const { removed } = cart.reconcileWithMenu([{ id: 1, available: true }, { id: 2, available: false }]);
    expect(cart.state.items).toHaveLength(1);
    expect(removed).toEqual(['Pepperoni']);
  });
});

describe('storage unavailable', () => {
  it('still works in memory when sessionStorage throws', async () => {
    globalThis.__breakStorage();
    const cart = await freshStore();
    expect(() => cart.addLine(MARGHERITA)).not.toThrow();
    expect(cart.state.items).toHaveLength(1);
  });
});
