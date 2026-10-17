import type { Metadata } from "next";
import { Wordmark } from "@/brand/Wordmark";
import { ButtonLink, Card, Page } from "@/components/ui";

export const metadata: Metadata = { title: "Account deleted", robots: { index: false, follow: false } };

/** Shown after "Delete account" (decision 0021) - public: the person is already signed out. */
export default function GoodbyePage() {
  return (
    <main id="main-content">
      <Page width="narrow">
        <Wordmark height={48} />
        <Card title="Your account was deleted">
          <p>Your Hunts, deals, items, sales, listings, photos and settings have been erased, and you&apos;ve been signed out.</p>
          <p>If you were on a paid plan, it was cancelled right away - you won&apos;t be charged again.</p>
          <p>Thanks for trying Rein Drop. Signing in again later starts a new, empty account.</p>
          <div>
            <ButtonLink href="/" variant="secondary">
              Go to the Rein Drop website
            </ButtonLink>
          </div>
        </Card>
      </Page>
    </main>
  );
}
