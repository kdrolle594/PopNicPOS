// Menu categories that are only sold during set hours.
// Hours are in the restaurant's local time: [startHour, endHour).

export const BREAKFAST = { category: 'Breakfast', startHour: 6, endHour: 11, label: '6–11 AM' };

export const CATEGORY_HOURS = new Map([[BREAKFAST.category.toLowerCase(), BREAKFAST]]);

// Hour of day (0-23) at `date` in `timeZone` (an IANA name such as
// "America/New_York"). Without a zone, the device's own zone is used.
export function hourIn(date, timeZone) {
  if (!timeZone) return date.getHours();
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hourCycle: 'h23' })
    .formatToParts(date);
  return Number(parts.find((p) => p.type === 'hour').value) % 24;
}

export function hoursFor(category) {
  return CATEGORY_HOURS.get(String(category || '').toLowerCase()) || null;
}

// True when items in `category` can be ordered at `date`.
export function isCategoryOpen(category, date = new Date(), timeZone) {
  const hours = hoursFor(category);
  if (!hours) return true;
  const h = hourIn(date, timeZone);
  return h >= hours.startHour && h < hours.endHour;
}
