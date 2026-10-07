import type { Metadata } from "next";
import { Card, EmptyState, Page } from "@/components/ui";
import { PlaceholderNotice } from "../placeholder-notice";

export const metadata: Metadata = { title: "Analytics" };

/** No mascot here: dense analytics is a "do not use" zone (Mascot Usage Guide, section 7). */
export default function AnalyticsPage() {
  return (
    <Page title="Analytics" description="Profit, spend and what is actually selling.">
      <PlaceholderNotice>
        Charts and Hunt/product analytics come after purchases and sales can be logged.
      </PlaceholderNotice>
      <Card>
        <EmptyState
          title="No sold data yet"
          description="Log what you buy and what you sell. Realized profit, margin and Hunt performance are calculated from those outcomes."
        />
      </Card>
    </Page>
  );
}
