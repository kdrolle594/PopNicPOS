import { describe, it, expect } from 'vitest';
import {
  queueMessage, stopsBeforeText, formatEta, formatClock, formatDistance, lastUpdatedText, secondsAgoText,
} from '../src/lib/delivery.js';

describe('queueMessage', () => {
  it('says you are next at position 1', () => {
    expect(queueMessage({ position: 1, totalStops: 3 })).toBe("You're next");
    expect(queueMessage({ position: 1, totalStops: 1 })).toBe("You're next");
  });
  it('shows the stop count and your place otherwise', () => {
    expect(queueMessage({ position: 2, totalStops: 3 })).toBe("Your driver has 3 deliveries · you're stop 2");
  });
  it('returns null without a position', () => {
    expect(queueMessage({ position: null, totalStops: 3 })).toBeNull();
    expect(queueMessage(null)).toBeNull();
  });
});

describe('stopsBeforeText', () => {
  it('pluralises', () => {
    expect(stopsBeforeText(2)).toBe('1 stop before you');
    expect(stopsBeforeText(4)).toBe('3 stops before you');
  });
});

describe('formatEta', () => {
  const now = new Date('2026-09-30T18:00:00Z');
  it('shows clock time and minutes', () => {
    expect(formatEta('2026-09-30T18:12:00Z', now)).toMatch(/^Arriving around .+ \(~12 min\)$/);
  });
  it('rounds up to at least 1 minute', () => {
    expect(formatEta('2026-09-30T18:00:20Z', now)).toMatch(/\(~1 min\)$/);
  });
  it('says any minute once the ETA has passed', () => {
    expect(formatEta('2026-09-30T17:59:00Z', now)).toBe('Arriving any minute');
  });
  it('says ETA pending when missing or invalid', () => {
    expect(formatEta(null, now)).toBe('ETA pending');
    expect(formatEta('not a date', now)).toBe('ETA pending');
  });
});

describe('formatClock', () => {
  it('returns a dash when missing', () => {
    expect(formatClock(null)).toBe('—');
    expect(formatClock('2026-09-30T18:12:00Z')).not.toBe('—');
  });
});

describe('formatDistance', () => {
  it('uses metres under 1 km and km above', () => {
    expect(formatDistance(850)).toBe('850 m away');
    expect(formatDistance(1830)).toBe('1.8 km away');
  });
  it('returns null without a distance', () => {
    expect(formatDistance(null)).toBeNull();
  });
});

describe('lastUpdatedText', () => {
  it('stays quiet for the first 60 seconds', () => {
    expect(lastUpdatedText(1_000_000, 1_000_000 + 60_000)).toBeNull();
  });
  it('reports minutes after that', () => {
    expect(lastUpdatedText(1_000_000, 1_000_000 + 61_000)).toBe('Last updated 1 min ago');
    expect(lastUpdatedText(1_000_000, 1_000_000 + 185_000)).toBe('Last updated 3 min ago');
  });
  it('returns null with no update yet', () => {
    expect(lastUpdatedText(null, 5)).toBeNull();
  });
});

describe('secondsAgoText', () => {
  it('formats the driver status strip', () => {
    expect(secondsAgoText(1_000_000, 1_008_400)).toBe('updated 8s ago');
    expect(secondsAgoText(1_000_000, 1_125_000)).toBe('updated 2 min ago');
    expect(secondsAgoText(null, 1)).toBe('waiting for first update');
  });
});
