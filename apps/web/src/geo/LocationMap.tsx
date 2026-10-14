"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useId, useRef } from "react";
import type { GeoPoint, MapTileSource } from "@rein-drop/api-client";
import { zoomForRadiusKm } from "@rein-drop/client-core";
import styles from "./LocationMap.module.css";

/** Where tiles come from (decision 0017). `osm` is development-only - see the geo contract. */
const TILE_URL: Record<MapTileSource, string> = {
  osm: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  proxy: "/api/geo/tiles/{z}/{x}/{y}",
};

export interface LocationMapProps {
  point: GeoPoint;
  /** Circle radius in km; null = pin only. */
  radiusKm: number | null;
  tiles: MapTileSource;
  attribution: string;
  /** The pin was dragged to a new centre. */
  onMovePin: (point: GeoPoint) => void;
  /** One line under the map saying what it shows (also the map's accessible description). */
  caption: string;
}

type Leaflet = typeof import("leaflet");

/**
 * Interactive web map under the location (decision 0017): orange pin (draggable) + the radius
 * circle, like Facebook Marketplace. Leaflet loads only when a map is shown. The location field
 * stays the accessible way to set the area; the map is a visual aid with a text caption.
 */
export function LocationMap({ point, radiusKm, tiles, attribution, onMovePin, caption }: LocationMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<{ L: Leaflet; map: import("leaflet").Map; marker: import("leaflet").Marker; circle: import("leaflet").Circle } | null>(null);
  const onMoveRef = useRef(onMovePin);
  const captionId = `${useId()}-caption`;

  useEffect(() => {
    onMoveRef.current = onMovePin;
  }, [onMovePin]);

  // Create the map once (Leaflet needs the DOM; it isn't server-rendered).
  useEffect(() => {
    let cancelled = false;
    void import("leaflet").then((L) => {
      if (cancelled || !containerRef.current || mapRef.current) return;
      const map = L.map(containerRef.current, { zoomControl: true, scrollWheelZoom: false, attributionControl: true });
      L.tileLayer(TILE_URL[tiles], { attribution, maxZoom: 19 }).addTo(map);
      const icon = L.divIcon({ className: styles.pinIcon, html: `<span class="${styles.pin}"></span>`, iconSize: [28, 28], iconAnchor: [14, 28] });
      const marker = L.marker([point.lat, point.lng], { draggable: true, icon, title: "Hunt centre - drag to move", alt: "Hunt centre" }).addTo(map);
      const circle = L.circle([point.lat, point.lng], { radius: (radiusKm ?? 0) * 1000, color: "#FF6B35", weight: 2, fillColor: "#FF6B35", fillOpacity: 0.12 }).addTo(map);
      marker.on("dragend", () => {
        const { lat, lng } = marker.getLatLng();
        circle.setLatLng([lat, lng]);
        onMoveRef.current({ lat, lng });
      });
      map.setView([point.lat, point.lng], zoomForRadiusKm(radiusKm));
      mapRef.current = { L, map, marker, circle };
    });
    return () => {
      cancelled = true;
      mapRef.current?.map.remove();
      mapRef.current = null;
    };
    // Created once per tile source; position and radius updates are applied below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tiles]);

  // Follow the point and radius when they change from the field.
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    const here = m.L.latLng(point.lat, point.lng);
    if (!m.marker.getLatLng().equals(here, 1e-4)) m.marker.setLatLng(here);
    m.circle.setLatLng(here);
    m.circle.setRadius((radiusKm ?? 0) * 1000);
    m.map.setView(here, zoomForRadiusKm(radiusKm), { animate: false });
  }, [point.lat, point.lng, radiusKm]);

  return (
    <figure className={styles.figure}>
      <div ref={containerRef} className={styles.map} role="region" aria-label="Map of the Hunt area" aria-describedby={captionId} />
      <figcaption id={captionId} className={styles.caption}>
        {caption}
      </figcaption>
    </figure>
  );
}
