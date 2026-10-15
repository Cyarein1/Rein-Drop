import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming, useReducedMotion } from 'react-native-reanimated';
import { space } from '@rein-drop/design-tokens';
import { useT } from '@/i18n/useT';
import { colors, GUTTER } from './theme';

/** Placeholder rows while a list loads (instead of a spinner and a sentence). Announced once as "Loading". */
export function SkeletonRows({ count = 5, thumb = 88 }: { count?: number; thumb?: number }) {
  const t = useT();
  const reduce = useReducedMotion();
  const pulse = useSharedValue(1);
  useEffect(() => {
    if (!reduce) pulse.value = withRepeat(withTiming(0.45, { duration: 800 }), -1, true);
  }, [pulse, reduce]);
  const style = useAnimatedStyle(() => ({ opacity: pulse.value }));
  return (
    <Animated.View style={style} accessible accessibilityRole="progressbar" accessibilityLabel={t('common.loading')}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={styles.row}>
          <View style={[styles.block, { width: thumb, height: thumb }]} />
          <View style={styles.lines}>
            <View style={[styles.block, styles.line, { width: '90%' }]} />
            <View style={[styles.block, styles.line, { width: '60%' }]} />
            <View style={[styles.block, styles.line, { width: '35%', height: 18 }]} />
          </View>
        </View>
      ))}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space[3], paddingHorizontal: GUTTER, paddingVertical: space[3], borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.separator },
  lines: { flex: 1, gap: space[2], paddingTop: 2 },
  block: { backgroundColor: colors.grouped, borderRadius: 6 },
  line: { height: 14 },
});
