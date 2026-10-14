import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, Text, View } from 'react-native';
import { ApiError, GEO_QUERY_MIN_LENGTH, type GeoPlace, type UserArea } from '@rein-drop/api-client';
import { SUGGEST_DEBOUNCE_MS } from '@rein-drop/client-core';
import { fontSize, radius, roles, size, space, wash } from '@rein-drop/design-tokens';
import { getApiClient } from '@/config/api';
import { Button, font, TextInput } from '@/ui';

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
        if (found.length > 0) AccessibilityInfo.announceForAccessibility(`${found.length} suggestion${found.length === 1 ? '' : 's'} below`);
      } catch (err) {
        if (ticket !== requestRef.current) return;
        setPlaces([]);
        setNotice(err instanceof ApiError ? err.message : "Suggestions aren't available right now - you can still type the place.");
      }
    }, SUGGEST_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, suggestions]);

  const pick = (place: GeoPlace) => {
    requestRef.current += 1;
    setPlaces([]);
    onPick(place);
    AccessibilityInfo.announceForAccessibility(`${place.label} selected`);
  };

  return (
    <View style={styles.wrap}>
      <TextInput
        label={label}
        hint={hint}
        placeholder={placeholder}
        value={value}
        autoCorrect={false}
        onChangeText={(t) => {
          onType(t);
          setQuery(t);
        }}
        error={error}
      />
      {places.length > 0 && (
        <View style={styles.list} accessibilityLabel={`${label} suggestions`}>
          {places.map((place, i) => (
            <Pressable
              key={`${place.label}-${i}`}
              accessibilityRole="button"
              accessibilityLabel={`Use ${place.label}`}
              onPress={() => pick(place)}
              style={({ pressed }) => [styles.option, i > 0 && styles.divider, pressed && styles.pressed]}
            >
              <Text style={[styles.optionText, font('regular')]}>{place.label}</Text>
            </Pressable>
          ))}
        </View>
      )}
      {notice && <Text style={[styles.notice, font('regular')]}>{notice}</Text>}
      {area && onUseArea && area.label !== value && (
        <View style={styles.start}>
          <Button variant="secondary" onPress={() => onUseArea(area)}>
            {`Use my area: ${area.label}`}
          </Button>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space[2], alignSelf: 'stretch' },
  list: { borderWidth: size.borderWidth, borderColor: roles.border, borderRadius: radius.sm, backgroundColor: roles.surface, overflow: 'hidden' },
  option: { minHeight: size.touchTarget, justifyContent: 'center', paddingHorizontal: space[3] },
  divider: { borderTopWidth: size.borderWidth, borderTopColor: roles.border },
  pressed: { backgroundColor: wash.sky },
  optionText: { color: roles.text, fontSize: fontSize.md },
  notice: { color: roles.textMuted, fontSize: fontSize.sm },
  start: { alignSelf: 'flex-start' },
});
