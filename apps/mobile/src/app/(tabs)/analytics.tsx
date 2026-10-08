import { useRouter } from 'expo-router';
import { PlaceholderNotice } from '@/components/PlaceholderNotice';
import { Button, Card, EmptyState, Screen } from '@/ui';

/** No mascot: dense analytics is a "do not use" zone (Mascot Usage Guide, section 7). */
export default function AnalyticsScreen() {
  const router = useRouter();
  return (
    <Screen description="Profit, spend and what is actually selling.">
      <PlaceholderNotice>Charts and Hunt/product analytics come next. Purchases and sales are already recorded in Inventory.</PlaceholderNotice>
      <Card>
        <EmptyState
          title="Track what you buy and sell"
          description="Realized profit, margin and Hunt performance are calculated from the purchases and sales in your Inventory."
          action={<Button onPress={() => router.push('/inventory')}>Open Inventory</Button>}
        />
      </Card>
    </Screen>
  );
}
