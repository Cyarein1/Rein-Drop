import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Wordmark } from "@/brand/Wordmark";
import { Card, LoadingState, Page } from "@/components/ui";
import { ApiStatus } from "./api-status";

export const metadata: Metadata = { title: "Developer" };

/** Developer status page: API liveness/readiness and links to dev tools. */
export default function DevHome() {
  return (
    <Page width="narrow">
      <Wordmark height={56} priority />
      <p>Local development tools</p>
      <Card title="System status">
        <Suspense fallback={<LoadingState label="Checking API…" />}>
          <ApiStatus />
        </Suspense>
      </Card>
      <ul>
        <li>
          <Link href="/home">App (authenticated shell)</Link>
        </li>
        <li>
          <Link href="/dev/ui">UI primitives gallery</Link>
        </li>
        <li>
          <Link href="/dev/notifications">Notification simulator log</Link>
        </li>
      </ul>
    </Page>
  );
}
