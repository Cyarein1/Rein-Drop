import { Suspense } from "react";
import Link from "next/link";
import { Wordmark } from "@/brand/Wordmark";
import { Card, LoadingState, Page } from "@/components/ui";
import { ApiStatus } from "./api-status";

export default function Home() {
  return (
    <Page width="narrow">
      <Wordmark height={56} priority />
      <p>Local development scaffold</p>
      <Card title="System status">
        <Suspense fallback={<LoadingState label="Checking API…" />}>
          <ApiStatus />
        </Suspense>
      </Card>
      <p>
        <Link href="/dev/ui">UI primitives gallery</Link>
      </p>
    </Page>
  );
}
