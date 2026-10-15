import type { Metadata } from "next";
import { huntFormContext, plainContext, resumeStep, type SnapshotStep } from "@rein-drop/client-core";
import { getServerApiClient, verifySession } from "@/auth";
import { Protected } from "@/auth/Protected";
import { Wordmark } from "@/brand/Wordmark";
import { ButtonLink, SystemBanner } from "@/components/ui";
import { SnapshotFlow } from "./SnapshotFlow";
import styles from "./onboarding.module.css";

export const metadata: Metadata = { title: "Set up Rein Drop" };

/**
 * Seller Snapshot onboarding (App Flow Blueprint section 4; Screenbook frames 03-08). Shown
 * without the app navigation so the person can focus on one question at a time.
 * `?edit=1` (from Settings) re-opens the questions with the saved answers.
 */
export default function OnboardingPage({ searchParams }: PageProps<"/onboarding">) {
  return (
    <main id="main-content" className={styles.main}>
      <div className={styles.frame}>
        <Wordmark height={32} priority />
        <Protected>
          <OnboardingLoader searchParams={searchParams} />
        </Protected>
      </div>
    </main>
  );
}

async function OnboardingLoader({ searchParams }: { searchParams: PageProps<"/onboarding">["searchParams"] }) {
  const [session, api, params] = await Promise.all([verifySession(), getServerApiClient(), searchParams]);
  const snapshot = await api.getSellerSnapshot().catch((err: unknown) => (err instanceof Error ? err : new Error(String(err))));

  if (snapshot instanceof Error) {
    return (
      <SystemBanner
        tone="error"
        title="Couldn't load your answers"
        message={snapshot.message}
        action={<ButtonLink href="/onboarding">Try again</ButtonLink>}
      />
    );
  }

  const editing = params.edit === "1";
  const startAt: SnapshotStep = editing ? (snapshot.isReseller ? "categories" : "gate") : resumeStep(snapshot);
  return <SnapshotFlow initial={snapshot} startAt={startAt} context={plainContext(huntFormContext(session.user.locale))} />;
}
