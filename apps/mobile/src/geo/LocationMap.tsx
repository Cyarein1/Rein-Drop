import { useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView, { Circle, Marker, type LatLng } from 'react-native-maps';
import type { GeoPoint } from '@rein-drop/api-client';
import { regionForRadius } from '@rein-drop/client-core';
import { brand, fontSize, radius, roles, space } from '@rein-drop/design-tokens';
import { useT } from '@/i18n/useT';
import { font } from '@/ui';

export interface LocationMapProps {
  point: GeoPoint;
  /** Circle radius in km; null = pin only. */
  radiusKm: number | null;
  onMovePin: (point: GeoPoint) => void;
  /** What the map shows, in words (also its accessibility label). */
  caption: string;
}

/**
 * Native map under the location (decision 0017): Apple Maps on iPhone, Google Maps on Android
 * (react-native-maps). Draggable pin + radius circle, like Facebook Marketplace.
 *
 * TODO(geo): Android release / development builds need GOOGLE_MAPS_ANDROID_API_KEY (app.config.ts)
 * - a Google Maps Platform key with billing, created by the owner. Expo Go works without it.
 */
export function LocationMap({ point, radiusKm, onMovePin, caption }: LocationMapProps) {
  const mapRef = useRef<MapView>(null);
  const t = useT();

  // Follow the point and radius when they change from the field.
  useEffect(() => {
    mapRef.current?.animateToRegion(regionForRadius(point, radiusKm), 250);
  }, [point, radiusKm]);

  const centre: LatLng = { latitude: point.lat, longitude: point.lng };
  return (
    <View style={styles.wrap}>
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={regionForRadius(point, radiusKm)}
        rotateEnabled={false}
        pitchEnabled={false}
        accessibilityLabel={t('location.mapA11y', { caption })}
      >
        <Marker
          coordinate={centre}
          draggable
          pinColor={brand.orange}
          title={t('location.pinTitle')}
          description={t('location.pinDescription')}
          onDragEnd={(e) => onMovePin({ lat: e.nativeEvent.coordinate.latitude, lng: e.nativeEvent.coordinate.longitude })}
        />
        {radiusKm ? <Circle center={centre} radius={radiusKm * 1000} strokeColor={brand.orange} strokeWidth={2} fillColor="rgba(255, 107, 53, 0.12)" /> : null}
      </MapView>
      <Text style={[styles.caption, font('regular')]}>{caption}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space[2], alignSelf: 'stretch' },
  // Fixed height: the form doesn't jump when the map appears.
  map: { height: 240, borderRadius: radius.md, overflow: 'hidden' },
  caption: { color: roles.textMuted, fontSize: fontSize.sm },
});
