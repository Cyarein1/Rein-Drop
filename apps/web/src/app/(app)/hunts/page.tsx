import type { Metadata } from "next";
import { Protected } from "@/auth/Protected";
import { ButtonLink, Card, EmptyState, Page } from "@/components/ui";
import { PlaceholderNotice } from "../placeholder-notice";

export const metadata: Metadata = { title: "Hunts" };

export default function HuntsPage() {
  return (
    <Protected>
      <Page
        title="Hunts"
        description="Everything Rein Drop is watching for you."
        actions={<ButtonLink href="/hunts/new">Create Hunt</ButtonLink>}
      >
        <PlaceholderNotice>
          Hunt list with Active, Paused and Draft tabs comes with the Hunt endpoints.
        </PlaceholderNotice>
        <Card>
          <EmptyState
            title="No Hunts yet"
            description="A Hunt is a saved search Rein Drop keeps checking on eBay and Facebook Marketplace."
            action={<ButtonLink href="/hunts/new">Create your first Hunt</ButtonLink>}
          />
        </Card>
      </Page>
    </Protected>
  );
}
