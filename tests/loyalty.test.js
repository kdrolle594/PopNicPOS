import { describe, it, expect } from 'vitest';
import { getTier, pointsForTotal, tierProgress } from '../shared/loyalty.js';

describe('loyalty rules', () => {
  it('earns 1 point per $10', () => {
    expect(pointsForTotal(9.99)).toBe(0);
    expect(pointsForTotal(10)).toBe(1);
    expect(pointsForTotal(54.5)).toBe(5);
    expect(pointsForTotal(-3)).toBe(0);
    expect(pointsForTotal('abc')).toBe(0);
  });

  it('maps balances to tiers', () => {
    expect(getTier(0)).toBe('bronze');
    expect(getTier(249)).toBe('bronze');
    expect(getTier(250)).toBe('silver');
    expect(getTier(500)).toBe('gold');
    expect(getTier(1500)).toBe('platinum');
  });

  it('reports progress to the next tier', () => {
    const p = tierProgress(320);
    expect(p.current.id).toBe('silver');
    expect(p.next.id).toBe('gold');
    expect(p.toNext).toBe(180);
    expect(p.progress).toBeCloseTo(70 / 250);
  });

  it('caps at the top tier', () => {
    const p = tierProgress(2000);
    expect(p.next).toBeNull();
    expect(p.progress).toBe(1);
  });
});
