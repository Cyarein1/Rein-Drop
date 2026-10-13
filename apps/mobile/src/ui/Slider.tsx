import RNSlider from '@react-native-community/slider';
import { StyleSheet, Text, View } from 'react-native';
import { brand, fontSize, roles, size, space } from '@rein-drop/design-tokens';
import { font } from './fonts';

export interface SliderProps {
  /** Accessible name (the visible field label usually stays on the paired input). */
  label: string;
  /** Position 0..max (whole steps). */
  value: number;
  max: number;
  onChange: (position: number) => void;
  /** What a screen reader announces for the position, e.g. "R 250,00" or "No limit". */
  valueText: string;
  /** Small labels under the two ends. */
  minLabel?: string;
  maxLabel?: string;
}

/**
 * Whole-step slider (0..max): orange fill, white thumb, 44 px touch height. Web counterpart:
 * `components/ui/Slider` (a native range input). The announced value is `valueText`.
 */
export function Slider({ label, value, max, onChange, valueText, minLabel, maxLabel }: SliderProps) {
  return (
    <View style={styles.wrap}>
      <RNSlider
        style={styles.slider}
        minimumValue={0}
        maximumValue={max}
        step={1}
        value={value}
        // Only emit real changes: the native control also fires while settling on the same step.
        onValueChange={(v) => {
          const position = Math.round(v);
          if (position !== value) onChange(position);
        }}
        minimumTrackTintColor={brand.orange}
        maximumTrackTintColor={roles.border}
        thumbTintColor={brand.orange}
        accessibilityLabel={label}
        accessibilityValue={{ min: 0, max, now: value, text: valueText }}
      />
      {(minLabel || maxLabel) && (
        <View style={styles.ends} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          <Text style={[styles.end, font('regular')]}>{minLabel}</Text>
          <Text style={[styles.end, font('regular')]}>{maxLabel}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space[1], alignSelf: 'stretch' },
  slider: { height: size.touchTarget, alignSelf: 'stretch' },
  ends: { flexDirection: 'row', justifyContent: 'space-between' },
  end: { color: roles.textMuted, fontSize: fontSize.sm },
});
