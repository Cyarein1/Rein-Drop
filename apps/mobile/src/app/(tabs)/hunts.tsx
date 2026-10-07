import { useRouter } from 'expo-router';
import { PlaceholderNotice } from '@/components/PlaceholderNotice';
import { Button, Card, EmptyState, Screen } from '@/ui';

export default function HuntsScreen() {
  const router = useRouter();
  return (
    <Screen description="Everything Rein Drop is watching for you.">
      <PlaceholderNotice>Active, Paused and Draft tabs come with the Hunt endpoints.</PlaceholderNotice>
      <Card>
        <EmptyState
          title="No Hunts yet"
          description="A Hunt is a saved search Rein Drop keeps checking on eBay and Facebook Marketplace."
          action={<Button onPress={() => router.push('/hunts/new')}>Create your first Hunt</Button>}
        />
      </Card>
    </Screen>
  );
}
