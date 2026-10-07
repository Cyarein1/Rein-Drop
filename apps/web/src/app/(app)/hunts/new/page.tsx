import type { Metadata } from "next";
import { ButtonLink, Card, Page } from "@/components/ui";
import { PlaceholderNotice } from "../../placeholder-notice";

export const metadata: Metadata = { title: "Create Hunt" };

/** Steps from the App Flow Blueprint, section 5 (first Hunt creation). */
const STEPS = [
  "What are you hunting?",
  "Marketplaces (eBay, Facebook Marketplace)",
  "Location (where local sourcing needs it)",
  "Condition",
  "Buy threshold",
  "Profit target (optional)",
  "Exclusions (optional)",
  "Review in plain English",
];

export default function CreateHuntPage() {
  return (
    <Page title="Create Hunt" description="Tell Rein Drop what to watch for." width="narrow">
      <PlaceholderNotice>
        The assisted Hunt builder is not built yet. It will follow these steps.
      </PlaceholderNotice>
      <Card title="What you will set up">
        <ol style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 8 }}>
          {STEPS.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </Card>
      <ButtonLink href="/hunts" variant="secondary">
        Back to Hunts
      </ButtonLink>
    </Page>
  );
}
