import { describe, it, expect } from 'vitest';
import { isCategoryOpen, hourIn, hoursFor } from '../shared/menuHours.js';

describe('menu hours', () => {
  it('leaves categories without hours open all day', () => {
    expect(isCategoryOpen('Pizza', new Date('2026-11-04T03:00:00Z'), 'UTC')).toBe(true);
    expect(hoursFor('Pizza')).toBeNull();
  });

  it('serves breakfast from 6 up to 11 in the given zone', () => {
    const at = (iso) => isCategoryOpen('Breakfast', new Date(iso), 'UTC');
    expect(at('2026-11-04T05:59:00Z')).toBe(false);
    expect(at('2026-11-04T06:00:00Z')).toBe(true);
    expect(at('2026-11-04T10:59:00Z')).toBe(true);
    expect(at('2026-11-04T11:00:00Z')).toBe(false);
  });

  it('matches the category name case-insensitively', () => {
    expect(isCategoryOpen('breakfast', new Date('2026-11-04T12:00:00Z'), 'UTC')).toBe(false);
  });

  it('converts to the restaurant zone', () => {
    // 12:00 UTC is 07:00 in New York (EST, November).
    expect(hourIn(new Date('2026-11-04T12:00:00Z'), 'America/New_York')).toBe(7);
    expect(isCategoryOpen('Breakfast', new Date('2026-11-04T12:00:00Z'), 'America/New_York')).toBe(true);
  });
});
