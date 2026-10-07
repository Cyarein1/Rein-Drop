import type { Metadata } from "next";
import { Protected } from "@/auth/Protected";
import { ButtonLink, Card, EmptyState, Page } from "@/components/ui";
import { PlaceholderNotice } from "../placeholder-notice";

export const metadata: Metadata = { title: "Deals" };

export default function DealsPage() {
  return (
    <Protected>
      <Page title="Deals" description="Listings your Hunts flagged as worth a look, best first.">
        <PlaceholderNotice>
          The ranked deal feed with Hunt, source and freshness filters comes with matching and deal
          analysis.
        </PlaceholderNotice>
        <Card>
          <EmptyState
            title="No deals yet"
            description="Deals appear here when a live Hunt finds a listing that clears your criteria."
            action={<ButtonLink href="/hunts/new">Create a Hunt</ButtonLink>}
          />
        </Card>
      </Page>
    </Protected>
  );
}
