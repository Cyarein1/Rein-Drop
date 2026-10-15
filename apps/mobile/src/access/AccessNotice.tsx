import { useEffect } from 'react';
import { AccessibilityInfo, StyleSheet, Text, View } from 'react-native';
import { companionAccessView, type CompanionAccessKind } from '@rein-drop/client-core';
import { radius, space, tones, type BadgeTone } from '@rein-drop/design-tokens';
import type { MessageKey } from '@rein-drop/i18n';
import { useSessionState } from '@/auth/SessionProvider';
import { useDisplayContext, useT } from '@/i18n/useT';
import { colors, font, Icon, icons, type } from '@/ui';
import { useAccess } from './AccessProvider';

const TITLE: Partial<Record<CompanionAccessKind, MessageKey>> = {
  suspended: 'access.titleSuspended',
  needs_attention: 'access.titleNeedsAttention',
  grace: 'access.titleNeedsAttention',
  ended: 'access.titleNoPaidAccess',
};

/**
 * A neutral note about the account's access on a tab (decision 0018) - only when something
 * differs from normal use. Never a price, an upgrade or a link to pay.
 * `only` limits which situations this tab mentions (Deals: suspension only).
 */
export function AccessNotice({ only }: { only?: CompanionAccessKind[] }) {
  const { load } = useAccess();
  const { state } = useSessionState();
  const ctx = useDisplayContext();
  const access = load.status === 'ready' ? load.access : load.status === 'error' ? load.stale : null;
  if (!access || state.status !== 'authenticated') return null;
  const view = companionAccessView(access, ctx.localeTag, ctx.t);
  const title = TITLE[view.kind];
  if (!title || (only && !only.includes(view.kind))) return null;
  return <CompactNotice tone={view.tone === 'loss' ? 'loss' : view.tone === 'fresh' ? 'fresh' : 'info'} title={ctx.t(title)} message={view.lines.join(' ')} />;
}

/**
 * A compact, calm one-block notice (tinted, small icon, title + one line) for status notes that
 * sit above a list - smaller than a SystemBanner. `loss` is announced as an alert.
 */
export function CompactNotice({ tone = 'info', title, message }: { tone?: Extract<BadgeTone, 'info' | 'fresh' | 'loss'>; title: string; message?: string }) {
  const t = useT();
  const c = tones[tone];
  const kind = tone === 'loss' ? 'error' : tone === 'fresh' ? 'warning' : 'info';
  const spoken = message ? t('common.bannerSpokenMessage', { tone: kind, title, message }) : t('common.bannerSpoken', { tone: kind, title });
  // Live regions are Android-only: announce problems explicitly (iOS too), like SystemBanner.
  useEffect(() => {
    if (tone === 'loss') AccessibilityInfo.announceForAccessibility(spoken);
  }, [tone, spoken]);
  return (
    <View
      accessible
      accessibilityRole={tone === 'loss' ? 'alert' : 'summary'}
      accessibilityLiveRegion={tone === 'loss' ? 'assertive' : 'polite'}
      accessibilityLabel={spoken}
      style={[styles.notice, { backgroundColor: c.background }]}
    >
      <Icon name={tone === 'info' ? icons.info : icons.warning} size={16} color={tone === 'loss' ? colors.lossText : tone === 'fresh' ? colors.warningText : colors.text} />
      <View style={styles.text}>
        <Text style={[styles.title, font('semibold')]}>{title}</Text>
        {message ? <Text style={[styles.message, font('regular')]}>{message}</Text> : null}
      </View>
    </View>
  );
}

/** False only while the account is suspended (Hunts can't be created or started). */
export function useCanUseHunts(): boolean {
  const { load } = useAccess();
  const access = load.status === 'ready' ? load.access : load.status === 'error' ? load.stale : null;
  return !(access?.suspended ?? false);
}

const styles = StyleSheet.create({
  notice: { flexDirection: 'row', alignItems: 'flex-start', gap: space[2], paddingVertical: 10, paddingHorizontal: space[3], borderRadius: radius.sm },
  text: { flex: 1, gap: 1 },
  title: { color: colors.text, fontSize: type.subhead },
  message: { color: colors.text, fontSize: type.footnote, lineHeight: 16 },
});
