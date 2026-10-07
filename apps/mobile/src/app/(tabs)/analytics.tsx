import { PlaceholderNotice } from '@/components/PlaceholderNotice';
import { Card, EmptyState, Screen } from '@/ui';

/** No mascot: dense analytics is a "do not use" zone (Mascot Usage Guide, section 7). */
export default function AnalyticsScreen() {
  return (
    <Screen description="Profit, spend and what is actually selling.">
      <PlaceholderNotice>Analytics summaries come after purchases and sales can be logged.</PlaceholderNotice>
      <Card>
        <EmptyState
          title="No sold data yet"
          description="Log what you buy and what you sell. Realized profit and Hunt performance are calculated from those outcomes."
        />
      </Card>
    </Screen>
  );
}
