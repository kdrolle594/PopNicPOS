// Loyalty rules shared by the server, POS and storefront.

// Lowest point balance for each tier, low to high.
export const TIERS = [
  { id: 'bronze', label: 'Bronze', min: 0 },
  { id: 'silver', label: 'Silver', min: 250 },
  { id: 'gold', label: 'Gold', min: 500 },
  { id: 'platinum', label: 'Platinum', min: 1000 },
];

// Every $10 spent earns 1 point (same rule the POS uses).
export const DOLLARS_PER_POINT = 10;

export function pointsForTotal(total) {
  const n = Number(total);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.floor(n / DOLLARS_PER_POINT);
}

export function getTier(points) {
  const p = Math.max(0, Number(points) || 0);
  let tier = TIERS[0];
  for (const t of TIERS) if (p >= t.min) tier = t;
  return tier.id;
}

// Where a balance sits between its tier and the next one.
// progress is 0..1; next is null at the top tier.
export function tierProgress(points) {
  const p = Math.max(0, Number(points) || 0);
  const index = TIERS.findIndex((t) => t.id === getTier(p));
  const current = TIERS[index];
  const next = TIERS[index + 1] || null;
  if (!next) return { current, next: null, toNext: 0, progress: 1 };
  return {
    current,
    next,
    toNext: next.min - p,
    progress: (p - current.min) / (next.min - current.min),
  };
}
