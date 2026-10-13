import type { Metadata } from "next";
import Link from "next/link";
import type { Home } from "@rein-drop/api-client";
import {
  attentionLine,
  countsLine,
  dealCardView,
  homeTargetPath,
  huntFormContext,
  huntsLine,
  monitoringLine,
  profitView,
  recentView,
  reducedMonitoringState,
  type HuntFormContext,
} from "@rein-drop/client-core";
import { getServerApiClient, verifySession } from "@/auth";
import { Protected } from "@/auth/Protected";
import { ButtonLink, Card, EmptyState, Metric, Page, ProductState, Spinner, SystemBanner } from "@/components/ui";
import { OnboardingRedirect } from "@/app/onboarding/OnboardingRedirect";
import { SourceBanner } from "@/components/SourceBanner";
import { DealCard } from "../deals/DealCard";
import styles from "./home.module.css";

export const metadata: Metadata = { title: "Home" };

/**
 * Returning-user Home (App Flow Blueprint section 8), in priority order: what needs attention,
 * whether Rein Drop is working, realized profit, recent activity, one recommendation. Mascots only
 * for meaningful empty / waiting / working states, and only approved art.
 */
export default function HomePage() {
  return (
    <Protected>
      <OnboardingRedirect />
      <Page title="Home" description="Is Rein Drop working, and is anything worth your attention?">
        <HomeLoader />
      </Page>
    </Protected>
  );
}

async function HomeLoader() {
  const session = await verifySession();
  const api = await getServerApiClient();
  const home = await api.getHome().catch(() => null);
  if (!home) {
    return (
      <SystemBanner
        tone="error"
        title="Couldn't load your Home"
        message="Rein Drop couldn't reach its server. Your Hunts keep running - try again in a moment."
        action={<ButtonLink href="/home" variant="secondary">Try again</ButtonLink>}
      />
    );
  }
  const context = huntFormContext(session.user.locale);
  const now = new Date(home.generatedAt);
  const anyHunts = home.hunts.live + home.hunts.paused + home.hunts.drafts > 0;
  const reduced = reducedMonitoringState(home.monitoring, now, context);

  // Brand-new account: one welcoming step, not five empty sections.
  if (!anyHunts) {
    return (
      <Card>
        <EmptyState
          mascot="welcome"
          title="Set up your first Hunt"
          description="Tell Rein Drop what to watch for. It checks the marketplaces and only alerts you when something looks worth acting on."
          action={<ButtonLink href={home.recommendation ? homeTargetPath(home.recommendation.target) : "/hunts/new"}>{home.recommendation?.actionLabel ?? "Create Hunt"}</ButtonLink>}
        />
      </Card>
    );
  }

  return (
    <>
      <SourceBanner sources={home.sources} now={now} />
      {reduced && <ProductState view={reduced} />}
      <Attention home={home} context={context} />
      <Hunts home={home} now={now} />
      <Profit home={home} context={context} />
      <Recent home={home} context={context} now={now} />
      <Recommendation home={home} />
    </>
  );
}

/** 1. What needs the user now. */
function Attention({ home, context }: { home: Home; context: HuntFormContext }) {
  const line = attentionLine(home.attention);
  return (
    <section aria-labelledby="attention" className={styles.section}>
      <div className={styles.sectionHead}>
        <h2 id="attention" className={styles.heading}>
          Needs your attention
        </h2>
        {home.attention.unreadAlerts > 0 && (
          <ButtonLink href="/alerts" variant="text">
            Inbox ({home.attention.unreadAlerts})
          </ButtonLink>
        )}
      </div>
      {line ? (
        <>
          <p className={styles.lead}>{line}</p>
          <ul className={styles.list}>
            {home.attention.top.map((deal) => (
              <li key={deal.id}>
                <DealCard view={dealCardView(deal, context)} headingLevel={3} />
              </li>
            ))}
          </ul>
          {home.attention.toReview > home.attention.top.length && (
            <ButtonLink href="/deals" variant="secondary">
              See all {home.attention.toReview} deals
            </ButtonLink>
          )}
        </>
      ) : (
        <Card>
          {/* Plain text: the "waiting" mascot belongs to a Hunt's no-deals-yet state (Hunt detail, Deals), not Home. */}
          <p className={styles.lead}>Nothing needs you right now.</p>
          <p className={styles.muted}>
            {home.hunts.live > 0
              ? `Rein Drop is watching ${home.hunts.live === 1 ? "1 Hunt" : `${home.hunts.live} Hunts`} and will alert you when something is worth a look.`
              : "No Hunt is live, so nothing new will arrive until one is."}
          </p>
        </Card>
      )}
    </section>
  );
}

/** 2. Is Rein Drop working? */
function Hunts({ home, now }: { home: Home; now: Date }) {
  return (
    <section aria-labelledby="hunts" className={styles.section}>
      <div className={styles.sectionHead}>
        <h2 id="hunts" className={styles.heading}>
          Your Hunts
        </h2>
        <ButtonLink href="/hunts" variant="text">
          View all
        </ButtonLink>
      </div>
      <p className={styles.muted}>{huntsLine(home.hunts)}</p>
      {home.hunts.items.length > 0 && (
        <Card>
          <ul className={styles.rows}>
            {home.hunts.items.map((h) => {
              const monitoring = monitoringLine({ status: h.status, marketplaces: h.activity.marketplaces.map((m) => m.marketplace), archivedAt: null }, h.activity, now);
              const counts = countsLine(h.activity);
              return (
                <li key={h.id} className={styles.huntRow}>
                  <Link href={`/hunts/${h.id}`} className={styles.huntName}>
                    {h.name}
                  </Link>
                  <span className={styles.monitoring} data-tone={monitoring.tone}>
                    {/* The normal loading UI: no mascot on every row (Mascot Usage Guide). */}
                    {monitoring.scanning && <Spinner size="sm" />}
                    {monitoring.text}
                  </span>
                  {counts && <span className={styles.muted}>{counts}</span>}
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </section>
  );
}

/** 3. Am I making money? Realized only. */
function Profit({ home, context }: { home: Home; context: HuntFormContext }) {
  const view = profitView(home.profit, context);
  return (
    <section aria-labelledby="profit" className={styles.section}>
      <h2 id="profit" className={styles.heading}>
        Realized profit <span className={styles.muted}>· {view.periodLabel}</span>
      </h2>
      <Card>
        <Metric label="Realized profit" value={view.realized?.value ?? "-"} tone={view.realized?.tone ?? "neutral"} caption={view.caption} />
        <p className={styles.muted}>
          Bought {view.bought} · Sold {view.sold} · Holding {view.holding}
        </p>
        {view.otherCurrencies.map((line) => (
          <p key={line} className={styles.muted}>
            {line}
          </p>
        ))}
        {(view.holding > 0 || view.sold > 0) && (
          <ButtonLink href="/inventory" variant="secondary">
            {view.holding > 0 ? `Inventory · ${view.holding} holding` : "Inventory"}
          </ButtonLink>
        )}
      </Card>
    </section>
  );
}

/** 4. Recent opportunities and outcomes. Hidden until there is something to show. */
function Recent({ home, context, now }: { home: Home; context: HuntFormContext; now: Date }) {
  if (home.recent.length === 0) return null;
  return (
    <section aria-labelledby="recent" className={styles.section}>
      <h2 id="recent" className={styles.heading}>
        Recent
      </h2>
      <Card>
        <ul className={styles.rows}>
          {home.recent.map((item) => {
            const view = recentView(item, context, now);
            const text = (
              <>
                <span className={styles.recentLabel}>{view.label}</span> {view.title}
                {view.amount && <span className={styles.amount}> · {view.amount}</span>}
              </>
            );
            return (
              <li key={`${item.kind}-${item.at}-${item.title}`} className={styles.recentRow}>
                {view.dealId ? <Link href={`/deals/${view.dealId}`}>{text}</Link> : <span>{text}</span>}
                <span className={styles.muted}>{view.when}</span>
              </li>
            );
          })}
        </ul>
      </Card>
    </section>
  );
}

/** 5. One thing worth doing next. (A suggestion shows the thinking mascot via ProductState.) */
function Recommendation({ home }: { home: Home }) {
  const rec = home.recommendation;
  if (!rec) return null;
  // Something wrong = a calm warning banner; a setup step or suggestion = the suggestion state
  // (thinking / idea mascot slot - the only place it appears on Home).
  if (rec.kind === "issue") {
    return (
      <section aria-label="Recommendation" className={styles.section}>
        <SystemBanner tone="warning" title={rec.title} message={rec.body} action={<ButtonLink href={homeTargetPath(rec.target)} variant="secondary">{rec.actionLabel}</ButtonLink>} />
      </section>
    );
  }
  return (
    <section aria-label="Recommendation" className={styles.section}>
      <ProductState
        headingLevel={2}
        view={{ state: "suggestion", title: rec.title, body: rec.body, details: [], live: false, actions: [{ label: rec.actionLabel, path: homeTargetPath(rec.target), variant: "secondary" }] }}
      />
    </section>
  );
}
