import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { fontSize, roles, size, space } from '@rein-drop/design-tokens';
import { font } from './fonts';

export interface DisclosureProps {
  summary: string;
  /** Start expanded (e.g. when the section already has values). */
  defaultOpen?: boolean;
  children: ReactNode;
}

/** Expandable section ("More filters"). */
export function Disclosure({ summary, defaultOpen = false, children }: DisclosureProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <View style={styles.container}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((v) => !v)}
        style={styles.summary}
      >
        <Text style={[styles.icon, font('bold')]}>{open ? '−' : '+'}</Text>
        <Text style={[styles.summaryText, font('semibold')]}>{summary}</Text>
      </Pressable>
      {open && <View style={styles.content}>{children}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { borderTopWidth: 1, borderTopColor: roles.border, alignSelf: 'stretch' },
  summary: { flexDirection: 'row', alignItems: 'center', minHeight: size.touchTarget, gap: space[2] },
  icon: { color: roles.text, fontSize: fontSize.lg, width: 20, textAlign: 'center' },
  summaryText: { color: roles.text, fontSize: fontSize.md },
  content: { gap: space[4], paddingBottom: space[2] },
});
