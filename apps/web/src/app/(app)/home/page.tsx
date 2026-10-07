import type { Metadata } from "next";
import { Protected } from "@/auth/Protected";
import { ButtonLink, Card, EmptyState, Metric, Page } from "@/components/ui";
import { PlaceholderNotice } from "../placeholder-notice";

export const metadata: Metadata = { title: "Home" };

/**
 * Returning-user home (App Flow Blueprint, section 8): attention now, live Hunts,
 * profit snapshot, recent outcomes, recommendation, plan status only when relevant.
 */
export default function HomePage() {
  return (
    <Protected>
      <Page title="Home" description="Is Rein Drop working, and is anything worth your attention?">
        <PlaceholderNotice>
          Real data arrives once Hunts, deals and outcomes are implemented. Sections follow the App
          Flow Blueprint home priorities.
        </PlaceholderNotice>

        <Card title="Attention now">
          <EmptyState
            mascot="welcome"
            title="Set up your first Hunt"
            description="Tell Rein Drop what to watch for. It checks the marketplaces and only alerts you when something looks worth acting on."
            action={<ButtonLink href="/hunts/new">Create Hunt</ButtonLink>}
          />
        </Card>

        <Card
          title="Live Hunts"
          action={
            <ButtonLink href="/hunts" variant="text">
              View all
            </ButtonLink>
          }
        >
          <p>No live Hunts yet.</p>
        </Card>

        <Card title="Profit snapshot">
          <div
            style={{
              display: "grid",
              gap: 24,
              gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            }}
          >
            <Metric
              label="Realized profit"
              value="—"
              caption="Appears after your first logged sale"
            />
            <Metric label="Bought" value="—" />
            <Metric label="Sold" value="—" />
          </div>
        </Card>
      </Page>
    </Protected>
  );
}
