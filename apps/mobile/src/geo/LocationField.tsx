import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, Text, View } from 'react-native';
import { ApiError, GEO_QUERY_MIN_LENGTH, type GeoPlace, type UserArea } from '@rein-drop/api-client';
import { SUGGEST_DEBOUNCE_MS } from '@rein-drop/client-core';
import { radius, space } from '@rein-drop/design-tokens';
import { getApiClient } from '@/config/api';
import { useT } from '@/i18n/useT';
import { Button, colors, font, Icon, icons, TextInput, type } from '@/ui';

export interface LocationFieldProps {
  label: string;
  hint?: string;
  placeholder?: string;
  value: string;
  onType: (text: string) => void;
  onPick: (place: GeoPlace) => void;
  error?: string;
  /** False when no geocoder is configured: a plain text field. */
  suggestions: boolean;
  area?: UserArea | null;
  onUseArea?: (area: UserArea) => void;
}

/**
 * Location with suggestions while typing (decision 0017). Suggestions appear under the field as
 * buttons (screen readers hear how many there are); typed text is always allowed - the API places
 * it on save. Web counterpart: apps/web/src/geo/LocationField.
 */
export function LocationField({ label, hint, placeholder, value, onType, onPick, error, suggestions, area, onUseArea }: LocationFieldProps) {
  const [places, setPlaces] = useState<GeoPlace[]>([]);
  const [query, setQuery] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const requestRef = useRef(0);
  const t = useT();

  useEffect(() => {
    if (!suggestions || query === null) return;
    const ticket = ++requestRef.current;
    const timer = setTimeout(async () => {
      const q = query.trim();
      if (q.length < GEO_QUERY_MIN_LENGTH) {
        if (ticket === requestRef.current) setPlaces([]);
        return;
      }
      try {
        const found = await getApiClient().suggestPlaces(q, 5);
        if (ticket !== requestRef.current) return;
        setPlaces(found);
        setNotice(null);
        if (found.length > 0) AccessibilityInfo.announceForAccessibility(t('location.suggestionsBelow', { count: found.length }));
      } catch (err) {
        if (ticket !== requestRef.current) return;
        setPlaces([]);
        setNotice(err instanceof ApiError ? err.message : t('location.suggestionsUnavailable'));
      }
    }, SUGGEST_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, suggestions, t]);

  const pick = (place: GeoPlace) => {
    requestRef.current += 1;
    setPlaces([]);
    onPick(place);
    AccessibilityInfo.announceForAccessibility(t('location.selected', { place: place.label }));
  };

  return (
    <View style={styles.wrap}>
      <TextInput
        label={label}
        hint={hint}
        placeholder={placeholder}
        value={value}
        autoCorrect={false}
        onChangeText={(text) => {
          onType(text);
          setQuery(text);
        }}
        error={error}
      />
      {places.length > 0 && (
        <View style={styles.list} accessibilityLabel={t('location.suggestionsFor', { label })}>
          {places.map((place, i) => (
            <Pressable
              key={`${place.label}-${i}`}
              accessibilityRole="button"
              accessibilityLabel={t('location.use', { place: place.label })}
              onPress={() => pick(place)}
              style={({ pressed }) => [styles.option, i > 0 && styles.divider, pressed && styles.pressed]}
            >
              <Icon name={icons.location} color={colors.textMuted} size={16} />
              <Text style={[styles.optionText, font('regular')]} numberOfLines={2}>
                {place.label}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
      {notice && <Text style={[styles.notice, font('regular')]}>{notice}</Text>}
      {area && onUseArea && area.label !== value && (
        <View style={styles.start}>
          <Button size="small" variant="secondary" icon={<Icon name={icons.location} size={14} />} onPress={() => onUseArea(area)}>
            {t('location.useMyArea', { place: area.label })}
          </Button>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space[2], alignSelf: 'stretch' },
  list: { borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.background, overflow: 'hidden' },
  option: { flexDirection: 'row', alignItems: 'center', gap: space[2], minHeight: 44, paddingHorizontal: space[3], paddingVertical: space[2] },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator },
  pressed: { backgroundColor: colors.grouped },
  optionText: { flex: 1, color: colors.text, fontSize: type.body },
  notice: { color: colors.textMuted, fontSize: type.subhead },
  start: { alignSelf: 'flex-start' },
});
