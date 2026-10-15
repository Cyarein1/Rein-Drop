import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { ApiError, type GeoPoint } from '@rein-drop/api-client';
import { space } from '@rein-drop/design-tokens';
import { getApiClient } from '@/config/api';
import { useT } from '@/i18n/useT';
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
  const t = useT();

  const changed = text.trim() !== (saved?.label ?? '') || JSON.stringify(point) !== JSON.stringify(saved?.point ?? null);

  const save = async () => {
    if (text.trim().length < 2) {
      setError(t('location.areaErrorShort'));
      return;
    }
    setSaving(true);
    try {
      const area = await getApiClient().setMyArea({ label: text.trim(), point, postalCode });
      setSaved(area);
      setDraft(null);
      setMessage(
        area?.point
          ? { tone: 'success', text: t('location.areaSaved') }
          : { tone: 'info', text: t('location.areaSavedText') },
      );
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof ApiError ? (err.details?.[0]?.message ?? err.message) : t('location.areaSaveFailed') });
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
      setMessage({ tone: 'success', text: t('location.areaRemoved') });
    } catch {
      setMessage({ tone: 'error', text: t('location.areaRemoveFailed') });
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <LocationField
        label={t('location.areaLabel')}
        hint={t('location.areaHint')}
        placeholder={geo.suggestions ? t('hunts.formLocationSuggest') : t('location.areaLabel')}
        value={text}
        onType={(typed) => {
          setDraft(typed === text ? { text, point, postalCode } : { text: typed, point: null, postalCode: null });
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
          caption={text ? t('location.areaCaption', { place: text }) : t('location.areaCaptionEmpty')}
        />
      )}
      {message && <SystemBanner tone={message.tone} title={message.text} />}
      <View style={styles.actions}>
        <Button onPress={save} loading={saving} disabled={!changed}>
          {t('location.areaSave')}
        </Button>
        {saved && (
          <Button variant="text" onPress={remove} disabled={saving}>
            {t('location.areaRemove')}
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
