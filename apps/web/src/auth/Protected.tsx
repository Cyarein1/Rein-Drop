import { Suspense, type ReactNode } from "react";
import { LoadingState } from "@/components/ui";
import { verifySession } from "./index";

async function RequireSession({ children }: { children: ReactNode }) {
  await verifySession();
  return <>{children}</>;
}

/**
 * Wrap every protected page's content. The session is verified per request behind
 * a Suspense boundary (required with Cache Components), so nothing protected
 * renders - or reaches the RSC payload - without a valid session.
 */
export function Protected({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<LoadingState label="Checking your session…" />}>
      <RequireSession>{children}</RequireSession>
    </Suspense>
  );
}
