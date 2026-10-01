import { haversineMeters } from '../../shared/geo.js';

export { haversineMeters };

export function queueMessage(update) {
  if (!update || update.position == null) return null;
  if (update.position === 1) return "You're next";
  return `Your driver has ${update.totalStops} deliveries · you're stop ${update.position}`;
}

export function stopsBeforeText(position) {
  const n = position - 1;
  return `${n} stop${n === 1 ? '' : 's'} before you`;
}

function parse(etaAt) {
  if (!etaAt) return null;
  const d = new Date(etaAt);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatClock(etaAt) {
  const d = parse(etaAt);
  return d ? d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : '—';
}

export function formatEta(etaAt, now = new Date()) {
  const d = parse(etaAt);
  if (!d) return 'ETA pending';
  const ms = d.getTime() - now.getTime();
  if (ms <= 0) return 'Arriving any minute';
  const minutes = Math.max(1, Math.round(ms / 60000));
  return `Arriving around ${formatClock(etaAt)} (~${minutes} min)`;
}

export function formatDistance(meters) {
  if (meters == null || !Number.isFinite(meters)) return null;
  if (meters < 1000) return `${Math.round(meters)} m away`;
  return `${(meters / 1000).toFixed(1)} km away`;
}

export function lastUpdatedText(receivedAt, now) {
  if (receivedAt == null || now - receivedAt <= 60_000) return null;
  return `Last updated ${Math.floor((now - receivedAt) / 60_000)} min ago`;
}

export function secondsAgoText(sentAt, now) {
  if (sentAt == null) return 'waiting for first update';
  const s = Math.max(0, Math.round((now - sentAt) / 1000));
  return s < 60 ? `updated ${s}s ago` : `updated ${Math.floor(s / 60)} min ago`;
}
