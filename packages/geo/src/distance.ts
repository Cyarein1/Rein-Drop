import type { GeoPoint } from './provider.js';

const EARTH_RADIUS_KM = 6371.0088;
const rad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance in km (haversine). Accurate to well under 1% - plenty for a pickup radius. */
export function distanceKm(a: GeoPoint, b: GeoPoint): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Coordinates kept for a person's area or a Hunt: 3 decimals (~110 m). Enough for a pickup radius,
 * never a doorstep (decision 0017: an area, not an address).
 */
export function roundPoint(point: GeoPoint): GeoPoint {
  return { lat: Math.round(point.lat * 1000) / 1000, lng: Math.round(point.lng * 1000) / 1000 };
}

export function isValidPoint(point: GeoPoint): boolean {
  return Number.isFinite(point.lat) && Number.isFinite(point.lng) && Math.abs(point.lat) <= 90 && Math.abs(point.lng) <= 180;
}

/**
 * Cache key for place text: lower case, accents folded, punctuation to spaces, whitespace collapsed,
 * plus the country bias ("cape town, wc" + ZA -> "ZA|cape town wc").
 */
export function placeKey(text: string, countryCode?: string | null): string {
  const normalized = text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
  return `${(countryCode ?? '').toUpperCase()}|${normalized}`;
}
