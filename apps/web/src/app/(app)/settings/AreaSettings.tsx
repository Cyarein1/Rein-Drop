"use client";

import { useState, useTransition } from "react";
import type { GeoConfig, GeoPoint, UserArea } from "@rein-drop/api-client";
import { Button, SystemBanner } from "@/components/ui";
import { clearMyArea, saveMyArea } from "@/geo/actions";
import { LocationField } from "@/geo/LocationField";
import { LocationMap } from "@/geo/LocationMap";

/**
 * "Your area" (decision 0017): a suburb, town or postal code - never a street address - offered as
 * one tap in Create Hunt. Pick a suggestion (or type; the API places the text on save).
 */
export function AreaSettings({ initial, geo }: { initial: UserArea | null; geo: GeoConfig }) {
  const [saved, setSaved] = useState(initial);
  const [text, setText] = useState(initial?.label ?? "");
  const [point, setPoint] = useState<GeoPoint | null>(initial?.point ?? null);
  const [postalCode, setPostalCode] = useState<string | null>(initial?.postalCode ?? null);
  const [message, setMessage] = useState<{ tone: "success" | "error" | "info"; text: string } | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [pending, start] = useTransition();
  const changed = text.trim() !== (saved?.label ?? "") || JSON.stringify(point) !== JSON.stringify(saved?.point ?? null);

  const save = () =>
    start(async () => {
      if (text.trim().length < 2) {
        setError("Enter a suburb, town or postal code");
        return;
      }
      const result = await saveMyArea({ label: text.trim(), point, postalCode });
      if (!result.ok) {
        setMessage({ tone: "error", text: result.message });
        return;
      }
      setSaved(result.area);
      setPoint(result.area?.point ?? null);
      setMessage(
        result.area?.point
          ? { tone: "success", text: "Saved. New Hunts can use it with one tap." }
          : { tone: "info", text: "Saved as text - we couldn't find it on the map, so distance can't be checked for it. Try picking a suggestion." },
      );
    });

  const remove = () =>
    start(async () => {
      const result = await clearMyArea();
      if (!result.ok) {
        setMessage({ tone: "error", text: result.message });
        return;
      }
      setSaved(null);
      setText("");
      setPoint(null);
      setPostalCode(null);
      setMessage({ tone: "success", text: "Your area was removed." });
    });

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <LocationField
        label="Suburb, town or postal code"
        hint="Not your street address - only used to suggest where your Hunts look."
        placeholder={geo.suggestions ? "Start typing a suburb, town or postal code" : "Suburb, town or postal code"}
        value={text}
        onType={(t) => {
          setText(t);
          if (t !== text) {
            setPoint(null);
            setPostalCode(null);
          }
          setError(undefined);
          setMessage(null);
        }}
        onPick={(place) => {
          setText(place.label);
          setPoint(place.point);
          setPostalCode(place.postalCode);
          setError(undefined);
          setMessage(null);
        }}
        error={error}
        suggestions={geo.suggestions}
      />
      {geo.tiles && point && (
        <LocationMap
          point={point}
          radiusKm={null}
          tiles={geo.tiles}
          attribution={geo.attribution ?? ""}
          onMovePin={(p) => setPoint({ lat: Math.round(p.lat * 1000) / 1000, lng: Math.round(p.lng * 1000) / 1000 })}
          caption={`Centre of ${text || "your area"}. Drag the pin to adjust.`}
        />
      )}
      {message && <SystemBanner tone={message.tone} title={message.text} />}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        <Button onClick={save} loading={pending} disabled={!changed}>
          Save area
        </Button>
        {saved && (
          <Button variant="text" onClick={remove} disabled={pending}>
            Remove
          </Button>
        )}
      </div>
    </div>
  );
}
