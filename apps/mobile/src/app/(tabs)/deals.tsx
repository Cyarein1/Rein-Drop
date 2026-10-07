import { useRouter } from 'expo-router';
import { PlaceholderNotice } from '@/components/PlaceholderNotice';
import { Button, Card, EmptyState, Screen } from '@/ui';

export default function DealsScreen() {
  const router = useRouter();
  return (
    <Screen description="Listings your Hunts flagged as worth a look, best first.">
      <PlaceholderNotice>The ranked deal feed comes with matching and deal analysis.</PlaceholderNotice>
      <Card>
        <EmptyState
          title="No deals yet"
          description="Deals appear here when a live Hunt finds a listing that clears your criteria."
          action={<Button onPress={() => router.push('/hunts/new')}>Create a Hunt</Button>}
        />
      </Card>
    </Screen>
  );
}
