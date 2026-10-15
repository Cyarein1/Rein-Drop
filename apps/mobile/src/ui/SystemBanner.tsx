import { useEffect, type ReactNode } from 'react';
import { AccessibilityInfo, StyleSheet, Text, View } from 'react-native';
import { bannerToneColors, radius, space, tones, type BannerTone } from '@rein-drop/design-tokens';
import { useT } from '@/i18n/useT';
import { font } from './fonts';
import { type } from './theme';

export interface SystemBannerProps {
  /** e.g. source degraded -> warning, payment issue -> error, plan limit -> info. */
  tone?: BannerTone;
  title: string;
  message?: string;
  /** Recovery action - banners should never be a dead end. */
  action?: ReactNode;
}

export function SystemBanner({ tone = 'info', title, message, action }: SystemBannerProps) {
  const tr = useT();
  const t = tones[bannerToneColors[tone]];
  const spoken = message ? tr('common.bannerSpokenMessage', { tone, title, message }) : tr('common.bannerSpoken', { tone, title });
  // Live regions are Android-only: announce errors and successes explicitly (iOS too).
  useEffect(() => {
    if (tone === 'error' || tone === 'success') AccessibilityInfo.announceForAccessibility(spoken);
  }, [tone, spoken]);
  return (
    <View
      accessibilityRole={tone === 'error' ? 'alert' : 'summary'}
      accessibilityLiveRegion={tone === 'error' ? 'assertive' : 'polite'}
      accessibilityLabel={spoken}
      style={[styles.banner, { backgroundColor: t.background, borderLeftColor: t.accent }]}
    >
      <Text style={[styles.title, font('semibold'), { color: t.foreground }]}>{title}</Text>
      {message && <Text style={[styles.message, font('regular'), { color: t.foreground }]}>{message}</Text>}
      {action && <View style={styles.action}>{action}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    gap: 2,
    paddingVertical: space[3],
    paddingHorizontal: 14,
    borderLeftWidth: 3,
    borderRadius: radius.md,
    alignSelf: 'stretch',
  },
  title: { fontSize: type.callout },
  message: { fontSize: type.subhead, lineHeight: 18 },
  action: { marginTop: space[2], alignItems: 'flex-start' },
});
