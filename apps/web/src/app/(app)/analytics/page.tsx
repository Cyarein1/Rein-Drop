import type { Metadata } from "next";
import { Protected } from "@/auth/Protected";
import { ButtonLink, Card, EmptyState, Page } from "@/components/ui";
import { PlaceholderNotice } from "../placeholder-notice";

export const metadata: Metadata = { title: "Analytics" };

/** No mascot here: dense analytics is a "do not use" zone (Mascot Usage Guide, section 7). */
export default function AnalyticsPage() {
  return (
    <Protected>
      <Page
        title="Analytics"
        description="Profit, spend and what is actually selling."
        actions={<ButtonLink href="/inventory" variant="secondary">Inventory</ButtonLink>}
      >
        <PlaceholderNotice>Charts and Hunt/product analytics come next. Purchases and sales are already recorded in Inventory.</PlaceholderNotice>
        <Card>
          <EmptyState
            title="Track what you buy and sell"
            description="Realized profit, margin and Hunt performance are calculated from the purchases and sales in your Inventory."
            action={<ButtonLink href="/inventory">Open Inventory</ButtonLink>}
          />
        </Card>
      </Page>
    </Protected>
  );
}
