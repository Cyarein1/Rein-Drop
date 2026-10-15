import type { ReactNode } from 'react';
import { useRouter, type Href } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { PRODUCT_STATE_MASCOTS, brand, radius, space, tones } from '@rein-drop/design-tokens';
import type { ProductStateView } from '@rein-drop/client-core';
import { Button, colors, font, type } from '@/ui';
import { MascotSlot } from '@/ui/MascotSlot';

/**
 * A polished product state (first scan, no deals yet, reduced monitoring, suggestion,
 * cancellation): mascot slot by STATE -> semantic token, title, body, facts and actions. Flat
 * (no card border) so it sits on a list screen like an empty state; info / suggestion states get
 * a soft tint.
 */
export function ProductState({ view, children }: { view: ProductStateView; children?: ReactNode }) {
  const router = useRouter();
  const accent = view.state === 'suggestion' ? styles.suggestion : view.state === 'firstScan' || view.state === 'reducedMonitoring' ? styles.info : null;
  return (
    <View style={[styles.state, accent]} accessibilityLiveRegion={view.live ? 'polite' : 'none'}>
      <MascotSlot token={PRODUCT_STATE_MASCOTS[view.state]} />
      <View style={styles.body}>
        <Text style={[styles.title, font('bold')]} accessibilityRole="header">
          {view.title}
        </Text>
        <Text style={[styles.text, font('regular')]}>{view.body}</Text>
        {view.details.map((d) => (
          <Text key={d} style={[styles.muted, font('regular')]}>
            {d}
          </Text>
        ))}
        {children}
        {view.actions.length > 0 && (
          <View style={styles.actions}>
            {view.actions.map((a) => (
              <Button key={a.label} size="small" variant={a.variant} onPress={() => router.push(a.path as Href)}>
                {a.label}
              </Button>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  state: { gap: space[3], paddingVertical: space[4], paddingHorizontal: space[4], borderRadius: radius.md },
  info: { backgroundColor: tones.info.background },
  suggestion: { borderLeftWidth: 3, borderLeftColor: brand.yellow, backgroundColor: tones.fresh.background },
  body: { gap: space[2] },
  title: { color: colors.text, fontSize: type.headline },
  text: { color: colors.text, fontSize: type.callout, lineHeight: 20 },
  muted: { color: colors.textMuted, fontSize: type.subhead },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2], marginTop: space[1] },
});
