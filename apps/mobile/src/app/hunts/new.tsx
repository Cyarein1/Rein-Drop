import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { fontSize, roles, space } from '@rein-drop/design-tokens';
import { PlaceholderNotice } from '@/components/PlaceholderNotice';
import { Button, Card, font, Screen } from '@/ui';

/** Steps from the App Flow Blueprint, section 5 (first Hunt creation). */
const STEPS = [
  'What are you hunting?',
  'Marketplaces (eBay, Facebook Marketplace)',
  'Location (where local sourcing needs it)',
  'Condition',
  'Buy threshold',
  'Profit target (optional)',
  'Exclusions (optional)',
  'Review in plain English',
];

/** Presented as a native modal from the central Create tab button. */
export default function CreateHuntScreen() {
  const router = useRouter();
  return (
    <Screen description="Tell Rein Drop what to watch for.">
      <PlaceholderNotice>The assisted Hunt builder is not built yet. It will follow these steps.</PlaceholderNotice>
      <Card title="What you will set up">
        {STEPS.map((step, i) => (
          <View key={step} style={styles.step}>
            <Text style={[styles.index, font('bold')]}>{i + 1}.</Text>
            <Text style={[styles.text, font('regular')]}>{step}</Text>
          </View>
        ))}
      </Card>
      <Button variant="secondary" onPress={() => router.back()}>
        Close
      </Button>
    </Screen>
  );
}

const styles = StyleSheet.create({
  step: { flexDirection: 'row', gap: space[2] },
  index: { color: roles.text, fontSize: fontSize.md, minWidth: 20 },
  text: { color: roles.text, fontSize: fontSize.md, flexShrink: 1 },
});
