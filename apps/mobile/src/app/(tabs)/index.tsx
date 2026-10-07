import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { roles } from '@rein-drop/design-tokens';
import { PlaceholderNotice } from '@/components/PlaceholderNotice';
import { Button, Card, EmptyState, font, Metric, Screen } from '@/ui';

/** Returning-user home (App Flow Blueprint, section 8). */
export default function HomeScreen() {
  const router = useRouter();
  return (
    <Screen description="Is Rein Drop working, and is anything worth your attention?">
      <PlaceholderNotice>Real data arrives once Hunts, deals and outcomes are implemented.</PlaceholderNotice>

      <Card title="Attention now">
        <EmptyState
          mascot="welcome"
          title="Set up your first Hunt"
          description="Tell Rein Drop what to watch for. It checks the marketplaces and only alerts you when something looks worth acting on."
          action={<Button onPress={() => router.push('/hunts/new')}>Create Hunt</Button>}
        />
      </Card>

      <Card title="Live Hunts">
        <Text style={[styles.muted, font('regular')]}>No live Hunts yet.</Text>
      </Card>

      <Card title="Profit snapshot">
        <View style={styles.metrics}>
          <Metric label="Realized profit" value="—" caption="Appears after your first logged sale" />
          <Metric label="Bought" value="—" />
          <Metric label="Sold" value="—" />
        </View>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  muted: { color: roles.textMuted },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 24 },
});
