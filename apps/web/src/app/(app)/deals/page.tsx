import type { Metadata } from "next";
import Link from "next/link";
import type { DealStatusFilter, MarketplaceKey } from "@rein-drop/api-client";
import { DEAL_FILTERS, huntFormContext } from "@rein-drop/client-core";
import { getServerApiClient, verifySession } from "@/auth";
import { Protected } from "@/auth/Protected";
import { ButtonLink, Card, EmptyState, Page, SystemBanner } from "@/components/ui";
import { DealFeed } from "./DealFeed";
import { DealSelects } from "./DealSelects";
import styles from "./deals.module.css";

export const metadata: Metadata = { title: "Deals" };

const PAGE_SIZE = 20;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function DealsPage({ searchParams }: PageProps<"/deals">) {
  return (
    <Protected>
      <Page title="Deals" description="Ranked by how strong the opportunity is, then how fresh.">
        <DealsLoader searchParams={searchParams} />
      </Page>
    </Protected>
  );
}

interface Filters {
  status: DealStatusFilter;
  huntId?: string;
  marketplace?: MarketplaceKey;
}

/** Unknown filter values are ignored rather than failing the page. */
function readFilters(params: Record<string, string | string[] | undefined>): Filters {
  const one = (key: string) => (typeof params[key] === "string" ? (params[key] as string) : undefined);
  const status = one("status");
  const huntId = one("hunt");
  const marketplace = one("source");
  return {
    status: DEAL_FILTERS.find((f) => f.value === status)?.value ?? "open",
    huntId: huntId && UUID.test(huntId) ? huntId : undefined,
    marketplace: marketplace === "ebay" || marketplace === "facebook" ? marketplace : undefined,
  };
}

function filterHref(filters: Filters): string {
  const query = new URLSearchParams();
  if (filters.status !== "open") query.set("status", filters.status);
  if (filters.huntId) query.set("hunt", filters.huntId);
  if (filters.marketplace) query.set("source", filters.marketplace);
  const text = query.toString();
  return text ? `/deals?${text}` : "/deals";
}

async function DealsLoader({ searchParams }: { searchParams: PageProps<"/deals">["searchParams"] }) {
  const filters = readFilters(await searchParams);
  const session = await verifySession();
  const api = await getServerApiClient();
  const result = await Promise.all([api.listDeals({ ...filters, limit: PAGE_SIZE }), api.listHunts({ limit: 100 })]).catch(() => null);

  const tabs = (
    <nav aria-label="Deal status" className={styles.tabs}>
      {DEAL_FILTERS.map((f) => (
        <Link
          key={f.value}
          href={filterHref({ ...filters, status: f.value })}
          className={styles.tab}
          aria-current={filters.status === f.value ? "page" : undefined}
        >
          {f.label}
        </Link>
      ))}
    </nav>
  );

  if (!result) {
    return (
      <>
        {tabs}
        <SystemBanner
          tone="error"
          title="Couldn't load your deals"
          message="Rein Drop couldn't reach its server. Your deals are safe - try again in a moment."
          action={<ButtonLink href={filterHref(filters)} variant="secondary">Try again</ButtonLink>}
        />
      </>
    );
  }
  const [page, hunts] = result;
  const filtered = Boolean(filters.huntId || filters.marketplace);

  return (
    <>
      <div className={styles.filters}>
        {tabs}
        <DealSelects
          hunts={hunts.items.map((h) => ({ id: h.id, name: h.name }))}
          huntId={filters.huntId ?? ""}
          marketplace={filters.marketplace ?? ""}
        />
      </div>
      {page.items.length === 0 ? (
        <Card>
          <EmptyDeals status={filters.status} hasHunts={hunts.items.length > 0} filtered={filtered} />
        </Card>
      ) : (
        <DealFeed
          // Remount when the filters change so "Show more" starts over.
          key={filterHref(filters)}
          initial={page}
          query={{ ...filters, limit: PAGE_SIZE }}
          context={huntFormContext(session.user.locale)}
        />
      )}
    </>
  );
}

function EmptyDeals({ status, hasHunts, filtered }: { status: DealStatusFilter; hasHunts: boolean; filtered: boolean }) {
  if (!hasHunts) {
    return (
      <EmptyState
        title="No deals yet"
        description="Deals appear here when a live Hunt finds a listing that clears your criteria."
        action={<ButtonLink href="/hunts/new">Create a Hunt</ButtonLink>}
      />
    );
  }
  const copy: Record<DealStatusFilter, { title: string; description: string }> = {
    open: {
      title: "Nothing to review right now",
      description: "Rein Drop keeps checking your live Hunts and lists anything worth a look here.",
    },
    new: { title: "No new deals", description: "You've seen everything so far." },
    seen: { title: "Nothing here", description: "Deals you've opened but not decided on appear here." },
    saved: { title: "No saved deals", description: "Save a deal to keep it handy while you decide." },
    bought: { title: "Nothing bought yet", description: "Deals you mark as bought appear here." },
    ignored: { title: "Nothing ignored", description: "Deals you mark as not for you appear here." },
    unavailable: { title: "Nothing unavailable", description: "Listings that sell or end appear here." },
    all: { title: "No deals yet", description: "Your live Hunts haven't found anything yet." },
  };
  if (filtered) {
    return (
      <EmptyState
        title={copy[status].title}
        description="Nothing here for this Hunt or source."
        action={<ButtonLink href={filterHref({ status })} variant="secondary">Clear filters</ButtonLink>}
      />
    );
  }
  return <EmptyState {...copy[status]} />;
}
