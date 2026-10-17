import type { Metadata } from "next";
import { connection } from "next/server";
import { huntFormContext, plainContext } from "@rein-drop/client-core";
import { getServerApiClient, verifySession } from "@/auth";
import { Protected } from "@/auth/Protected";
import { Page } from "@/components/ui";
import { loadInventoryItem } from "../load-item";
import { ItemPage } from "./ItemPage";

export const metadata: Metadata = { title: "Item" };

/** The one item page (decision 0021): header, actions allowed now, closure, the item's history. */
export default function SellItemPage({ params, searchParams }: PageProps<"/sell/items/[id]">) {
  return (
    <Protected>
      <Page>
        <ItemLoader params={params} searchParams={searchParams} />
      </Page>
    </Protected>
  );
}

async function ItemLoader({ params, searchParams }: { params: PageProps<"/sell/items/[id]">["params"]; searchParams: PageProps<"/sell/items/[id]">["searchParams"] }) {
  await connection(); // "today" (form defaults) is per request
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const session = await verifySession();
  const item = await loadInventoryItem(id);
  // The history is shown when it loads; the item page still works without it.
  const events = await (await getServerApiClient())
    .getInventoryEvents(item.id)
    .then((r) => r.items)
    .catch(() => null);
  return (
    <ItemPage
      initial={item}
      initialEvents={events}
      context={plainContext(huntFormContext(session.user.locale))}
      today={new Date().toISOString()}
      notice={query.added === "1" ? "Added. List it for sale whenever you're ready." : null}
    />
  );
}
