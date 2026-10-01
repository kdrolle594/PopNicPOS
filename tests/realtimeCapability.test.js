import { describe, it, expect } from 'vitest';
import { capabilityFor } from '../server/realtime.js';

describe('capabilityFor', () => {
  it('lets a guest subscribe to menu only', () => {
    expect(capabilityFor(undefined)).toEqual({ menu: ['subscribe'] });
    expect(capabilityFor(null)).toEqual({ menu: ['subscribe'] });
  });
  it('gives a customer only menu and their own channel', () => {
    expect(capabilityFor({ id: 42, role: 'customer' })).toEqual({
      menu: ['subscribe'], 'customer:42': ['subscribe'],
    });
  });
  it('gives staff and drivers menu and orders', () => {
    for (const role of ['cashier', 'kitchen', 'manager', 'admin', 'driver']) {
      expect(capabilityFor({ id: 7, role })).toEqual({ menu: ['subscribe'], orders: ['subscribe'] });
    }
  });
  it('never grants publish', () => {
    for (const user of [null, { id: 1, role: 'customer' }, { id: 2, role: 'driver' }, { id: 3, role: 'admin' }]) {
      const rights = Object.values(capabilityFor(user)).flat();
      expect(rights).not.toContain('publish');
    }
  });
});
