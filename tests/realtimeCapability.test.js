import { describe, it, expect } from 'vitest';
import { capabilityFor } from '../server/realtime.js';

describe('capabilityFor', () => {
  it('lets a guest subscribe to menu only', () => {
    expect(capabilityFor(undefined)).toEqual({ menu: ['subscribe'] });
    expect(capabilityFor(null)).toEqual({ menu: ['subscribe'] });
  });
  it('keeps existing rights for signed-in users and adds menu', () => {
    expect(capabilityFor({ role: 'customer' })).toEqual({
      menu: ['subscribe'], orders: ['subscribe'], 'delivery:*': ['subscribe'],
    });
  });
  it('lets drivers publish delivery positions', () => {
    expect(capabilityFor({ role: 'driver' })['delivery:*']).toEqual(['publish', 'subscribe']);
  });
});
