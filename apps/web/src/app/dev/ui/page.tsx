import type { Metadata } from "next";
import { colors, wash } from "@rein-drop/design-tokens";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  LoadingState,
  MascotSlot,
  Metric,
  Page,
  ProductState,
  SystemBanner,
  TextInput,
} from "@/components/ui";
import { MASCOT_TOKENS } from "@rein-drop/design-tokens";
import { productStateSamples } from "@rein-drop/client-core";

export const metadata: Metadata = { title: "UI primitives - Rein Drop" };

const swatches = [
  ["Canvas White", colors.canvas],
  ["Rein Navy", colors.navy],
  ["Rein Orange", colors.orange],
  ["Drop Yellow", colors.yellow],
  ["Profit Green", colors.green],
  ["Sky Wash", colors.skyWash],
  ["Loss Red", colors.lossRed],
  ["Soft Orange", wash.orange],
  ["Soft Yellow", wash.yellow],
] as const;

/** Fixed sample time: the gallery is prerendered, so its "now" must not change per request. */
const GALLERY_NOW = new Date("2026-10-08T12:00:00.000Z");

/** Development-only gallery of every primitive and variant (not product UI). */
export default function UiGallery() {
  return (
    <Page title="UI primitives" description="Development gallery - every primitive and variant.">
      <Card title="Palette">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          {swatches.map(([name, hex]) => (
            <div key={name} style={{ width: 112, fontSize: 12 }}>
              <div
                style={{
                  height: 48,
                  borderRadius: 8,
                  background: hex,
                  border: "1px solid var(--rd-neutral-border)",
                }}
              />
              <strong>{name}</strong>
              <div>{hex}</div>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Button">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          <Button>Start watching</Button>
          <Button variant="secondary">Save</Button>
          <Button variant="text">Edit criteria</Button>
          <Button variant="destructive">Archive Hunt</Button>
          <Button loading>Activating</Button>
          <Button disabled>Disabled</Button>
        </div>
      </Card>

      <Card title="TextInput">
        <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
          <TextInput label="Email" kind="email" placeholder="you@example.com" />
          <TextInput label="Password" kind="password" hint="At least 8 characters" />
          <TextInput label="Max buy price" kind="money" currency="USD" placeholder="0.00" />
          <TextInput label="Search" kind="search" placeholder="Find Hunts, deals…" />
          <TextInput label="Hunt name" error="Name is required" defaultValue="" />
        </div>
      </Card>

      <Card title="Badge">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <Badge tone="fresh">Just dropped · 2 min ago</Badge>
          <Badge tone="neutral">eBay</Badge>
          <Badge tone="neutral">Facebook Marketplace</Badge>
          <Badge tone="info">High confidence</Badge>
          <Badge tone="action">Live</Badge>
          <Badge tone="profit">Sold</Badge>
          <Badge tone="loss">Unavailable</Badge>
        </div>
      </Card>

      <Card title="Metric">
        <div style={{ display: "grid", gap: 24, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
          <Metric label="Capital deployed" value="$1,240" />
          <Metric label="Realized profit" value="+$386" tone="profit" />
          <Metric label="Realized loss" value="-$42" tone="loss" />
          <Metric label="Upside" value="$150" estimated caption="Based on recent sold listings" />
          <Metric label="Sale price" value="$310" comparison={{ label: "Expected", value: "$280" }} />
        </div>
      </Card>

      <Card title="SystemBanner">
        <SystemBanner
          tone="warning"
          title="Facebook Marketplace checks are delayed"
          message="eBay monitoring continues normally."
        />
        <SystemBanner
          tone="error"
          title="Payment failed"
          message="Your Hunts and data are safe."
          action={<Button variant="secondary">Update payment</Button>}
        />
        <SystemBanner
          tone="info"
          title="Active Hunt limit reached"
          message="Your draft is saved. Pause another Hunt or upgrade."
        />
        <SystemBanner tone="success" title="Hunt is live" />
      </Card>

      <Card title="EmptyState">
        <EmptyState
          mascot="welcome"
          title="No Hunts yet"
          description="Tell Rein Drop what to watch for and it will check the marketplaces for you."
          action={<Button>Create your first Hunt</Button>}
        />
        <EmptyState
          mascot="waiting"
          title="No deals yet"
          description="Your Hunt is live. Rein Drop will show deals here as soon as something matches."
        />
      </Card>

      <Card title="LoadingState">
        <LoadingState label="Loading deals…" />
      </Card>

      <Card title="Mascot tokens">
        <p>Approved art where it exists; a dashed neutral placeholder otherwise (tracked in docs/ASSET_TODO.md).</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
          {MASCOT_TOKENS.map((t) => (
            <figure key={t} style={{ margin: 0, display: "grid", justifyItems: "center", gap: 4 }}>
              <MascotSlot token={t} size={64} />
              <figcaption style={{ fontSize: 12 }}>{t}</figcaption>
            </figure>
          ))}
        </div>
      </Card>

      <Card title="Product states">
        {productStateSamples(GALLERY_NOW).map((view) => (
          <ProductState key={view.state + view.title} view={view} headingLevel={3}>
            {"consequences" in view && (
              <>
                <ul>
                  {view.consequences.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
                <SystemBanner tone="info" title="Not available yet" message={view.unavailableReason} />
              </>
            )}
          </ProductState>
        ))}
      </Card>
    </Page>
  );
}
