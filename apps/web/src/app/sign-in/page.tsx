import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { getAuthSetup } from "@/auth/provider";
import { Wordmark } from "@/brand/Wordmark";
import { ButtonLink, Card, LoadingState, Page, SystemBanner } from "@/components/ui";

export const metadata: Metadata = { title: "Sign in" };

/**
 * PLACEHOLDER sign-in. The managed auth provider is not chosen yet, so there is no
 * sign-in form. Explains the situation instead of being a dead end.
 * TODO(auth): replace with the provider's sign-in (email + password per App Flow Blueprint 3.2).
 */
export default function SignInPage() {
  return (
    <main id="main-content">
      <Page width="narrow">
        <Wordmark height={48} priority />
        <Suspense fallback={<LoadingState />}>
          <SignInStatus />
        </Suspense>
      </Page>
    </main>
  );
}

async function SignInStatus() {
  await connection();
  const setup = getAuthSetup();

  if (!setup.ok) {
    return (
      <SystemBanner
        tone="warning"
        title="Sign-in is not available"
        message={`${setup.reason} A managed sign-in provider has not been chosen yet.`}
      />
    );
  }

  return (
    <Card title="Development sign-in">
      <p>
        In development you are signed in automatically as the seeded local user. If you were sent
        here, the API did not recognise that user.
      </p>
      <ol style={{ margin: 0, paddingLeft: 20 }}>
        <li>
          Make sure the API is running: <code>pnpm --filter api dev</code>
        </li>
        <li>
          Create the development user: <code>pnpm db:seed</code>
        </li>
      </ol>
      <div>
        <ButtonLink href="/home">Try again</ButtonLink>
      </div>
    </Card>
  );
}
