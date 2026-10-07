import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ApiError } from "@rein-drop/api-client";
import { getServerApiClient } from "@/auth";
import { Badge, Card, LoadingState, Page, SystemBanner, type BadgeProps } from "@/components/ui";

export const metadata: Metadata = { title: "Notification simulator log" };

const STATUS_TONE: Record<string, NonNullable<BadgeProps["tone"]>> = {
  SENT: "profit",
  SIMULATED: "info",
  PENDING: "fresh",
  SKIPPED: "neutral",
  FAILED: "loss",
};

/**
 * DEVELOPMENT ONLY: every notification delivery for the signed-in user - in-app, and the push /
 * email messages the local simulator "sent" (also logged by the worker as [simulated push] lines).
 */
export default function NotificationLogPage() {
  return (
    <Page title="Notification simulator log" description="Development only. Push and email are simulated - nothing leaves this machine.">
      <p>
        <Link href="/dev">← Developer</Link> · <Link href="/alerts">Inbox</Link> · <Link href="/settings">Notification settings</Link>
      </p>
      <Suspense fallback={<LoadingState label="Loading deliveries…" />}>
        <DeliveryLog />
      </Suspense>
    </Page>
  );
}

async function DeliveryLog() {
  let log;
  try {
    log = await (await getServerApiClient()).getNotificationLog();
  } catch (err) {
    const notAvailable = err instanceof ApiError && err.status === 404;
    return (
      <SystemBanner
        tone={notAvailable ? "info" : "error"}
        title={notAvailable ? "Not available" : "Couldn't load the log"}
        message={notAvailable ? "The simulator log only exists outside production." : err instanceof Error ? err.message : String(err)}
      />
    );
  }
  if (log.items.length === 0) {
    return (
      <Card>
        <p>No deliveries yet. They appear when a live Hunt produces an alert-worthy deal.</p>
      </Card>
    );
  }
  return (
    <Card>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--rd-font-size-sm)" }}>
          <thead>
            <tr style={{ textAlign: "left" }}>
              <th scope="col">When</th>
              <th scope="col">Alert</th>
              <th scope="col">Channel</th>
              <th scope="col">Status</th>
              <th scope="col">Detail</th>
            </tr>
          </thead>
          <tbody>
            {log.items.map((d) => (
              <tr key={d.id} style={{ borderTop: "1px solid var(--rd-neutral-border)", verticalAlign: "top" }}>
                <td>{new Date(d.sentAt ?? d.createdAt).toISOString().replace("T", " ").slice(0, 19)}</td>
                <td>{d.title}</td>
                <td>{d.channel}</td>
                <td>
                  <Badge tone={STATUS_TONE[d.status] ?? "neutral"}>{d.status}</Badge>
                </td>
                <td>{[d.provider, d.reason, d.attempts > 0 ? `${d.attempts} attempt(s)` : null].filter(Boolean).join(" · ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
