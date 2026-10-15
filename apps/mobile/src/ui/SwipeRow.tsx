import { useRef, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import { space } from '@rein-drop/design-tokens';
import { font } from './fonts';
import { haptic } from './haptics';
import { Icon, type IconName } from './Icon';
import { colors, type } from './theme';

export interface SwipeAction {
  label: string;
  icon: IconName;
  /** Fill behind the row while swiping. */
  color: string;
  textColor?: string;
  onAction: () => void;
}

/**
 * A list row with swipe actions: swipe right = `left` action (e.g. Save), swipe left = `right`
 * action (e.g. Not for me). Swiping past the threshold commits the action.
 * Swiping must never be the only way: the CHILD's own accessible element (the row's Pressable)
 * must offer the same actions as `accessibilityActions` - this wrapper isn't focusable, so
 * screen readers would never reach actions placed here (see DealCard).
 */
export function SwipeRow({ children, left, right, enabled = true }: { children: ReactNode; left?: SwipeAction; right?: SwipeAction; enabled?: boolean }) {
  const ref = useRef<SwipeableMethods>(null);
  const actions = [left, right].filter((a): a is SwipeAction => !!a);
  const commit = (a: SwipeAction) => {
    haptic.tap();
    ref.current?.close();
    a.onAction();
  };
  return (
    <ReanimatedSwipeable
      ref={ref}
      enabled={enabled && actions.length > 0}
      friction={1.6}
      leftThreshold={72}
      rightThreshold={72}
      overshootFriction={8}
      renderLeftActions={left ? () => <Behind action={left} align="left" /> : undefined}
      renderRightActions={right ? () => <Behind action={right} align="right" /> : undefined}
      onSwipeableOpen={(direction) => {
        // direction = the side the row moved to: "right" reveals the left action.
        const a = direction === 'right' ? left : right;
        if (a) commit(a);
      }}
    >
      {children}
    </ReanimatedSwipeable>
  );
}

function Behind({ action, align }: { action: SwipeAction; align: 'left' | 'right' }) {
  return (
    <View style={[styles.behind, { backgroundColor: action.color, alignItems: align === 'left' ? 'flex-start' : 'flex-end' }]}>
      <View style={styles.content} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Icon name={action.icon} color={action.textColor ?? colors.text} size={20} />
        <Text style={[styles.text, font('semibold'), { color: action.textColor ?? colors.text }]}>{action.label}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  behind: { flex: 1, justifyContent: 'center', paddingHorizontal: space[6], minWidth: 120 },
  content: { alignItems: 'center', gap: 2 },
  text: { fontSize: type.footnote },
});
