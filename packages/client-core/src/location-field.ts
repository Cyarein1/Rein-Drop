import { HUNT_RADIUS_KM_MAX, unitToKm, type DistanceUnit, type GeoPlace, type GeoPoint, type UserArea } from '@rein-drop/contracts';
import type { HuntFormValues } from './hunt-form.js';

/**
 * Shared behaviour of the location field in Create / Edit Hunt and "Your area" (decision 0017):
 * suggestions while typing, "Use my area", and the map with a pin + radius circle.
 */

/** Wait this long after the last keystroke before asking for suggestions. */
export const SUGGEST_DEBOUNCE_MS = 250;

/** Picking a suggestion: its label becomes the text, its coordinates the point. */
export function pickPlace(values: HuntFormValues, place: Pick<GeoPlace, 'label' | 'point'>): HuntFormValues {
  return { ...values, locationText: place.label, locationPoint: place.point };
}

/** Typing over the text drops the point (it belonged to the old text); the API places the new text. */
export function typeLocation(values: HuntFormValues, text: string): HuntFormValues {
  return { ...values, locationText: text, locationPoint: text === values.locationText ? values.locationPoint : null };
}

/** "Use my area": the profile's area as this Hunt's location (a copy - later edits don't follow). */
export function applyArea(values: HuntFormValues, area: UserArea): HuntFormValues {
  return { ...values, locationText: area.label, locationPoint: area.point };
}

/** Moving the map pin keeps the label and moves the point (the label still names the area). */
export function movePin(values: HuntFormValues, point: GeoPoint): HuntFormValues {
  return { ...values, locationPoint: { lat: Math.round(point.lat * 1000) / 1000, lng: Math.round(point.lng * 1000) / 1000 } };
}

/** The radius field as km for the map circle; null while empty or not a valid radius. */
export function radiusKmForMap(radiusText: string, unit: DistanceUnit): number | null {
  const radius = Number(radiusText.trim());
  if (!radiusText.trim() || !Number.isInteger(radius) || radius < 1) return null;
  return Math.min(unitToKm(radius, unit), HUNT_RADIUS_KM_MAX);
}

/** Web-map zoom that fits a radius circle in a ~300 px tall map (no radius: a town-sized view). */
export function zoomForRadiusKm(radiusKm: number | null): number {
  if (radiusKm === null) return 11;
  // Each zoom level halves the metres per pixel; ~150 px from the centre to the circle edge.
  const metresPerPixelAtZoom0 = 156_543;
  const zoom = Math.log2((metresPerPixelAtZoom0 * 150) / (radiusKm * 1000));
  return Math.max(3, Math.min(14, Math.floor(zoom)));
}

/** Native map region (latitude / longitude deltas) that fits the radius with a margin. */
export function regionForRadius(point: GeoPoint, radiusKm: number | null): { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number } {
  const km = (radiusKm ?? 10) * 2.4;
  const latitudeDelta = km / 111;
  const longitudeDelta = km / (111 * Math.max(0.2, Math.cos((point.lat * Math.PI) / 180)));
  return { latitude: point.lat, longitude: point.lng, latitudeDelta, longitudeDelta };
}

/** One line under the map: what it shows, and that the radius is checked. */
export function mapCaption(label: string, radiusKm: number | null, radiusText: string, unit: DistanceUnit): string {
  return radiusKm
    ? `Deals within ${radiusText.trim()} ${unit} of ${label}. Drag the pin to adjust the centre.`
    : `Centre: ${label}. Add a radius to only see deals nearby. Drag the pin to adjust.`;
}
