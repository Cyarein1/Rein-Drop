import { Image, StyleSheet, View } from 'react-native';
import type { MascotToken } from '@rein-drop/design-tokens';
import { radius, roles, tones } from '@rein-drop/design-tokens';
import { mascotAssets } from '@/brand/assets';
import { NavIcon } from '@/navigation/options';

type SymbolName = Parameters<typeof NavIcon>[0]['name'];

/**
 * The one way product UI shows a mascot: by semantic token, never a file name. Approved art when it
 * exists; otherwise a NEUTRAL placeholder (a plain system icon in a soft circle - not mascot
 * artwork), tracked in docs/ASSET_TODO.md. Decorative: the text carries the meaning.
 */
const PLACEHOLDER_ICON: Partial<Record<MascotToken, SymbolName>> = {
  working: { ios: 'arrow.triangle.2.circlepath', android: 'autorenew' },
  waiting: { ios: 'hourglass', android: 'hourglass_empty' },
  afterHours: { ios: 'moon', android: 'bedtime' },
  suggestion: { ios: 'lightbulb', android: 'lightbulb' },
  analysis: { ios: 'magnifyingglass', android: 'search' },
  exceptionalDeal: { ios: 'sparkles', android: 'auto_awesome' },
  success: { ios: 'party.popper', android: 'celebration' },
  profit: { ios: 'chart.line.uptrend.xyaxis', android: 'trending_up' },
  cancellation: { ios: 'xmark.circle', android: 'cancel' },
};

export function MascotSlot({ token, size = 64 }: { token: MascotToken; size?: number }) {
  const art = mascotAssets[token];
  if (art) {
    return <Image source={art} style={{ width: size, height: size, resizeMode: 'contain' }} accessibilityIgnoresInvertColors accessible={false} />;
  }
  return (
    <View
      style={[styles.placeholder, { width: size, height: size }]}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      testID={`asset-todo-${token}`}
    >
      <NavIcon name={PLACEHOLDER_ICON[token] ?? { ios: 'sparkles', android: 'auto_awesome' }} color={roles.textMuted} size={Math.round(size * 0.42)} />
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: roles.border,
    borderRadius: radius.full,
    backgroundColor: tones.neutral.background,
  },
});
