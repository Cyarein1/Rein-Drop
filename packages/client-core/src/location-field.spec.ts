import { describe, expect, it } from 'vitest';
import { buildCreateHuntRequest, EMPTY_HUNT_FORM, huntFormContext } from './hunt-form.js';
import { mapCaption, movePin, pickPlace, radiusKmForMap, radiusQuickPicks, regionForRadius, typeLocation, applyArea, zoomForRadiusKm } from './location-field.js';

const SANDTON = { label: 'Sandton, Johannesburg, Gauteng', point: { lat: -26.108, lng: 28.057 } };
const base = { ...EMPTY_HUNT_FORM, query: 'iPhone 13', marketplaces: ['facebook' as const] };
const ctx = huntFormContext({ countryCode: 'ZA', currency: 'ZAR', distanceUnit: 'km', language: 'en', source: 'detected' });

describe('location field', () => {
  it('picking a suggestion sets text + point, and the request carries the point', () => {
    const values = { ...pickPlace(base, SANDTON), radius: '25' };
    const result = buildCreateHuntRequest(values, ctx);
    expect(result.ok && result.request.location).toEqual({ text: SANDTON.label, radiusKm: 25, point: SANDTON.point });
  });

  it('typing over the text drops the old point; retyping the same text keeps it', () => {
    const picked = pickPlace(base, SANDTON);
    expect(typeLocation(picked, 'Sandto').locationPoint).toBeNull();
    expect(typeLocation(picked, SANDTON.label).locationPoint).toEqual(SANDTON.point);
    const typed = buildCreateHuntRequest({ ...typeLocation(picked, 'Rosebank'), radius: '' }, ctx);
    expect(typed.ok && typed.request.location).toEqual({ text: 'Rosebank', radiusKm: null, point: null });
  });

  it('"Use my area" copies the profile area (label + point, or text only)', () => {
    expect(applyArea(base, { label: 'Sandton', point: SANDTON.point, postalCode: null, updatedAt: null })).toMatchObject({ locationText: 'Sandton', locationPoint: SANDTON.point });
    expect(applyArea(base, { label: 'Somewhere', point: null, postalCode: null, updatedAt: null }).locationPoint).toBeNull();
  });

  it('moving the pin keeps the label and rounds the point (~110 m)', () => {
    const moved = movePin(pickPlace(base, SANDTON), { lat: -26.12345, lng: 28.06789 });
    expect(moved).toMatchObject({ locationText: SANDTON.label, locationPoint: { lat: -26.123, lng: 28.068 } });
  });

  it('radius for the map in km (miles converted), null while invalid', () => {
    expect(radiusKmForMap('25', 'km')).toBe(25);
    expect(radiusKmForMap('10', 'mi')).toBe(16);
    expect(radiusKmForMap('', 'km')).toBeNull();
    expect(radiusKmForMap('2.5', 'km')).toBeNull();
    expect(radiusKmForMap('9999', 'km')).toBe(500);
  });

  it('zooms out as the radius grows; native regions fit the circle', () => {
    expect(zoomForRadiusKm(5)).toBeGreaterThan(zoomForRadiusKm(50));
    expect(zoomForRadiusKm(500)).toBeGreaterThanOrEqual(3);
    expect(zoomForRadiusKm(null)).toBe(11);
    const region = regionForRadius(SANDTON.point, 25);
    expect(region.latitudeDelta * 111).toBeGreaterThan(50);
  });

  it('caption says what the circle means', () => {
    expect(mapCaption('Sandton', 25, '25', 'km')).toBe('Deals within 25 km of Sandton. Drag the pin to adjust the centre.');
    expect(mapCaption('Sandton', null, '', 'km')).toMatch(/^Centre: Sandton. Add a radius/);
  });

  it('German: caption and the radius-without-location error', () => {
    const de = huntFormContext({ countryCode: 'DE', currency: 'EUR', distanceUnit: 'km', language: 'de', source: 'detected' });
    expect(de.language).toBe('de');
    expect(mapCaption('Berlin', 25, ' 25 ', 'km', de.t)).toBe('Deals im Umkreis von 25 km um Berlin. Zieh die Markierung, um den Mittelpunkt anzupassen.');
    expect(mapCaption('Berlin', null, '', 'km', de.t)).toMatch(/^Mittelpunkt: Berlin\. Füge einen Umkreis hinzu/);
    const result = buildCreateHuntRequest({ ...base, locationText: '', radius: '10' }, de);
    expect(result.ok === false && result.errors.locationText).toBe('Füge einen Ort für den Umkreis hinzu');
  });
});

describe('radiusQuickPicks', () => {
  it('whole numbers in the unit, valid for the request', () => {
    for (const unit of ['km', 'mi'] as const) {
      const c = huntFormContext({ countryCode: 'US', currency: 'USD', distanceUnit: unit, language: 'en', source: 'detected' });
      for (const r of radiusQuickPicks(unit)) {
        const result = buildCreateHuntRequest({ ...base, locationText: 'Austin', radius: String(r) }, c);
        expect(result.ok).toBe(true);
      }
    }
  });
});
