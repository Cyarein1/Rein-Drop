import type { Metadata } from "next";
import Link from "next/link";
import { huntFormContext, missedView, periodLabel } from "@rein-drop/client-core";
import { getServerApiClient, verifySession } from "@/auth";
import { Protected } from "@/auth/Protected";
import { Badge, ButtonLink, Card, EmptyState, Page, SystemBanner } from "@/components/ui";
import styles from "../analytics.module.css";
import { AnalyticsNav, PeriodTabs, readPeriod, withPeriod } from "../parts";

export const metadata: Metadata = { title: "Missed potential" };

/** Missed potential (screen 27): strong deals that got away. Potential is estimated and never a loss. */
export default function MissedPotentialPage({ searchParams }: PageProps<"/analytics/missed">) {
  return (
    <Protected>
      <Page title="Missed potential" description="Strong deals you didn't buy. Potential, not a loss.">
        <MissedLoader searchParams={searchParams} />
      </Page>
    </Protected>
  );
}

async function MissedLoader({ searchParams }: { searchParams: PageProps<"/analytics/missed">["searchParams"] }) {
  const period = readPeriod(await searchParams);
  const session = await verifySession();
  const ctx = huntFormContext(session.user.locale);
  const api = await getServerApiClient();
  const missed = await api.getMissedPotential({ period }).catch(() => null);

  return (
    <div className={styles.stack}>
      <PeriodTabs path="/analytics/missed" period={period} />
      <AnalyticsNav period={period} current="missed" />
      {!missed ? (
        <SystemBanner tone="error" title="Couldn't load missed potential" message="Try again in a moment." action={<ButtonLink href={withPeriod("/analytics/missed", period)} variant="secondary">Try again</ButtonLink>} />
      ) : (
        <MissedBody view={missedView(missed, ctx)} period={periodLabel(period)} />
      )}
    </div>
  );
}

function MissedBody({ view, period }: { view: ReturnType<typeof missedView>; period: string }) {
  if (view.empty) {
    return (
      <Card>
        <EmptyState title={view.headline} description={`${period}: every strong deal was either bought or is still open.`} action={<ButtonLink href="/deals" variant="secondary">See open deals</ButtonLink>} />
      </Card>
    );
  }
  return (
    <>
      <div className={styles.potential}>
        <p className={styles.itemTitle}>{view.headline}</p>
        <p className={styles.small}>{view.breakdown}</p>
        {view.potential ? (
          <>
            <p className={styles.cardLabel}>
              Estimated potential <span className={[styles.basis, styles.basisEstimated].join(" ")}>Estimated</span>
            </p>
            {/* Neutral colour on purpose: an estimate is neither profit (green) nor loss (red). */}
            <p className={styles.cardValue}>{view.potential.value}</p>
            <p className={styles.small}>{view.potential.caption}</p>
          </>
        ) : (
          <p className={styles.small}>None of these had a resale estimate, so their potential can&apos;t be valued. It is never counted as a loss.</p>
        )}
      </div>
      <section aria-labelledby="missed-deals" className={styles.section}>
        <h2 id="missed-deals" className={styles.heading}>
          The deals
        </h2>
        <ul className={styles.list}>
          {view.items.map((i) => (
            <li key={i.dealId} className={styles.item}>
              <div className={styles.itemHead}>
                <Link href={`/deals/${i.dealId}`} className={styles.itemTitle}>
                  {i.title}
                </Link>
                <Badge tone="neutral">{i.reason}</Badge>
              </div>
              <p className={styles.small}>{i.meta}</p>
              {i.estimate && <p className={styles.small}>{i.estimate} (estimate)</p>}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
