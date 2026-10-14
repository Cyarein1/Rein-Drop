import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { ApiError, type GeoPoint } from '@rein-drop/api-client';
import { space } from '@rein-drop/design-tokens';
import { getApiClient } from '@/config/api';
import { Button, SystemBanner } from '@/ui';
import { LocationField } from './LocationField';
import { LocationMap } from './LocationMap';
import { useLocationSupport } from './useLocationSupport';

/**
 * "Your area" (decision 0017): a suburb, town or postal code - never a street address - offered as
 * one tap in Create Hunt. Web counterpart: settings/AreaSettings.
 */
export function AreaSettings() {
  const { geo, area: saved, setArea: setSaved } = useLocationSupport();
  // What's being edited; null = showing the saved area (which loads after the first render).
  const [draft, setDraft] = useState<{ text: string; point: GeoPoint | null; postalCode: string | null } | null>(null);
  const text = draft?.text ?? saved?.label ?? '';
  const point = draft ? draft.point : (saved?.point ?? null);
  const postalCode = draft ? draft.postalCode : (saved?.postalCode ?? null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [error, setError] = useState<string | undefined>();


  const changed = text.trim() !== (saved?.label ?? '') || JSON.stringify(point) !== JSON.stringify(saved?.point ?? null);

  const save = async () => {
    if (text.trim().length < 2) {
      setError('Enter a suburb, town or postal code');
      return;
    }
    setSaving(true);
    try {
      const area = await getApiClient().setMyArea({ label: text.trim(), point, postalCode });
      setSaved(area);
      setDraft(null);
      setMessage(
        area?.point
          ? { tone: 'success', text: 'Saved. New Hunts can use it with one tap.' }
          : { tone: 'info', text: "Saved as text - we couldn't find it on the map, so distance can't be checked for it. Try picking a suggestion." },
      );
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof ApiError ? (err.details?.[0]?.message ?? err.message) : "We couldn't save your area. Please try again." });
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setSaving(true);
    try {
      await getApiClient().clearMyArea();
      setSaved(null);
      setDraft(null);
      setMessage({ tone: 'success', text: 'Your area was removed.' });
    } catch {
      setMessage({ tone: 'error', text: "We couldn't remove your area. Please try again." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <LocationField
        label="Suburb, town or postal code"
        hint="Not your street address - only used to suggest where your Hunts look."
        placeholder={geo.suggestions ? 'Start typing a suburb, town or postal code' : 'Suburb, town or postal code'}
        value={text}
        onType={(t) => {
          setDraft(t === text ? { text, point, postalCode } : { text: t, point: null, postalCode: null });
          setError(undefined);
          setMessage(null);
        }}
        onPick={(place) => {
          setDraft({ text: place.label, point: place.point, postalCode: place.postalCode });
          setError(undefined);
          setMessage(null);
        }}
        error={error}
        suggestions={geo.suggestions}
      />
      {geo.provider !== 'none' && point && (
        <LocationMap
          point={point}
          radiusKm={null}
          onMovePin={(p) => setDraft({ text, postalCode, point: { lat: Math.round(p.lat * 1000) / 1000, lng: Math.round(p.lng * 1000) / 1000 } })}
          caption={`Centre of ${text || 'your area'}. Drag the pin to adjust.`}
        />
      )}
      {message && <SystemBanner tone={message.tone} title={message.text} />}
      <View style={styles.actions}>
        <Button onPress={save} loading={saving} disabled={!changed}>
          Save area
        </Button>
        {saved && (
          <Button variant="text" onPress={remove} disabled={saving}>
            Remove
          </Button>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space[3] },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space[3] },
});
