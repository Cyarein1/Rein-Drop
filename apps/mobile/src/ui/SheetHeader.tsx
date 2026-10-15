import { Pressable, StyleSheet, Text, View } from 'react-native';
import { space } from '@rein-drop/design-tokens';
import { useT } from '@/i18n/useT';
import { font } from './fonts';
import { colors, type } from './theme';

/**
 * Title row for a form-sheet screen (native sheets show no navigation header): title on the left,
 * Cancel on the right. The sheet itself is a route with `sheetOptions()` (navigation/options).
 */
export function SheetHeader({ title, onCancel, cancelLabel }: { title: string; onCancel: () => void; cancelLabel?: string }) {
  const t = useT();
  return (
    <View style={styles.row}>
      <Text accessibilityRole="header" style={[styles.title, font('bold')]} numberOfLines={2}>
        {title}
      </Text>
      <Pressable accessibilityRole="button" onPress={onCancel} hitSlop={8} style={({ pressed }) => [styles.cancel, pressed && styles.pressed]}>
        <Text style={[styles.cancelText, font('medium')]}>{cancelLabel ?? t('common.cancel')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[3], minHeight: 44 },
  title: { flex: 1, color: colors.text, fontSize: type.title },
  cancel: { minHeight: 44, justifyContent: 'center' },
  cancelText: { color: colors.textMuted, fontSize: type.body },
  pressed: { opacity: 0.6 },
});
