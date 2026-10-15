import * as Haptics from 'expo-haptics';

/** Small, consistent haptic feedback. Never required for meaning; failures are ignored. */
export const haptic = {
  /** Selecting a chip, toggling. */
  select: () => void Haptics.selectionAsync().catch(() => {}),
  /** A swipe action or quick decision committed. */
  tap: () => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}),
  /** A saved form / completed action. */
  success: () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}),
};
