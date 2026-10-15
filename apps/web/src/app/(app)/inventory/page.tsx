import type { Metadata } from "next";
import Link from "next/link";
import { huntFormContext, plainContext, INVENTORY_FILTERS, inventoryEmptyText, type InventoryFilter } from "@rein-drop/client-core";
import { getServerApiClient, verifySession } from "@/auth";
import { Protected } from "@/auth/Protected";
import { ButtonLink, Card, EmptyState, Page, SystemBanner } from "@/components/ui";
import { InventoryList } from "./InventoryList";
import styles from "./inventory.module.css";

export const metadata: Metadata = { title: "Inventory" };

const PAGE_SIZE = 20;

/** Inventory (screen 21): bought items, holding time, Mark sold; sold items with realized results. */
export default function InventoryPage({ searchParams }: PageProps<"/inventory">) {
  return (
    <Protected>
      <Page title="Inventory" description="What you bought, how long you've held it, and what it sold for.">
        <InventoryLoader searchParams={searchParams} />
      </Page>
    </Protected>
  );
}

const hrefFor = (filter: InventoryFilter) => (filter === "holding" ? "/inventory" : `/inventory?status=${filter}`);

async function InventoryLoader({ searchParams }: { searchParams: PageProps<"/inventory">["searchParams"] }) {
  const params = await searchParams;
  const requested = typeof params.status === "string" ? params.status : "holding";
  const filter: InventoryFilter = INVENTORY_FILTERS.find((f) => f.value === requested)?.value ?? "holding";
  const session = await verifySession();
  const api = await getServerApiClient();
  const page = await api.listInventory({ status: filter, limit: PAGE_SIZE }).catch(() => null);

  const tabs = (
    <nav aria-label="Inventory status" className={styles.tabs}>
      {INVENTORY_FILTERS.map((f) => (
        <Link key={f.value} href={hrefFor(f.value)} className={styles.tab} aria-current={filter === f.value ? "page" : undefined}>
          {f.label}
        </Link>
      ))}
    </nav>
  );

  if (!page) {
    return (
      <>
        {tabs}
        <SystemBanner
          tone="error"
          title="Couldn't load your inventory"
          message="Rein Drop couldn't reach its server. Nothing you recorded is lost - try again in a moment."
          action={<ButtonLink href={hrefFor(filter)} variant="secondary">Try again</ButtonLink>}
        />
      </>
    );
  }

  if (page.items.length === 0) {
    const empty = inventoryEmptyText(filter);
    return (
      <>
        {tabs}
        <Card>
          <EmptyState
            title={empty.title}
            description={empty.body}
            // The approved "holding box" mascot explains purchase tracking - only when there's nothing yet.
            mascot={filter === "sold" ? undefined : "inventory"}
            action={
              filter === "sold" ? (
                <ButtonLink href="/inventory" variant="secondary">See what you&apos;re holding</ButtonLink>
              ) : (
                <ButtonLink href="/deals">Go to deals</ButtonLink>
              )
            }
          />
        </Card>
      </>
    );
  }

  return (
    <>
      {tabs}
      <InventoryList key={filter} initial={page} query={{ status: filter, limit: PAGE_SIZE }} context={plainContext(huntFormContext(session.user.locale))} />
    </>
  );
}
