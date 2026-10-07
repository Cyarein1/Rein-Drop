"use client";

import { Button, Page, SystemBanner } from "@/components/ui";

/**
 * Shown when a protected page cannot render - most often because the session could
 * not be verified (API unreachable). Offers a retry; never a dead end.
 */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <Page title="Something went wrong" width="narrow">
      <SystemBanner
        tone="error"
        title="We couldn't load this page"
        message={
          process.env.NODE_ENV === "production"
            ? "Please try again in a moment."
            : `${error.message}. In development, check that the API is running (pnpm --filter api dev).`
        }
        action={
          <Button variant="secondary" onClick={reset}>
            Try again
          </Button>
        }
      />
    </Page>
  );
}
