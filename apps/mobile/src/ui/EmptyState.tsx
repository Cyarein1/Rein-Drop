import type { ReactNode } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { fontSize, roles, space, type MascotToken } from '@rein-drop/design-tokens';
import { mascotAssets } from '../brand/assets';
import { font } from './fonts';

export interface EmptyStateProps {
  title: string;
  description?: string;
  /** Always offer a useful next action - "no dead ends" (App Flow Blueprint, section 1). */
  action?: ReactNode;
  /**
   * Optional illustration zone. Renders the approved asset for the token, or
   * nothing if none is approved yet. Decorative: the text carries the meaning.
   */
  mascot?: MascotToken;
}

export function EmptyState({ title, description, action, mascot }: EmptyStateProps) {
  const asset = mascot ? mascotAssets[mascot] : null;
  return (
    <View style={styles.empty}>
      {asset != null && (
        <Image
          source={asset}
          style={styles.illustration}
          resizeMode="contain"
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
      )}
      <Text accessibilityRole="header" style={[styles.title, font('bold')]}>
        {title}
      </Text>
      {description && <Text style={[styles.description, font('regular')]}>{description}</Text>}
      {action && <View style={styles.action}>{action}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { alignItems: 'center', gap: space[3], paddingVertical: space[8], paddingHorizontal: space[4] },
  illustration: { width: 140, height: 140 },
  title: { color: roles.text, fontSize: fontSize.xl, textAlign: 'center' },
  description: { color: roles.textMuted, fontSize: fontSize.md, textAlign: 'center' },
  action: { marginTop: space[2] },
});
