import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ApiError } from "@rein-drop/api-client";
import { connection } from "next/server";
import { huntFormContext, plainContext } from "@rein-drop/client-core";
import { getServerApiClient, verifySession } from "@/auth";
import { Protected } from "@/auth/Protected";
import { Page } from "@/components/ui";
import { SellEditor } from "./SellEditor";

export const metadata: Metadata = { title: "List for sale" };

export default function SellListingPage({ params }: PageProps<"/sell/[id]">) {
  return (
    <Protected>
      <Page width="narrow">
        <ListingLoader params={params} />
      </Page>
    </Protected>
  );
}

async function ListingLoader({ params }: { params: PageProps<"/sell/[id]">["params"] }) {
  await connection(); // "today" (Mark as sold defaults) is per request
  const { id } = await params;
  const [session, api] = await Promise.all([verifySession(), getServerApiClient()]);
  const [listing, marketplaces] = await Promise.all([
    api.getSellListing(id).catch((err: unknown) => {
      if (err instanceof ApiError && (err.status === 404 || err.code === "VALIDATION_FAILED")) notFound();
      throw err;
    }),
    api.getSellMarketplaces(),
  ]);
  // The purchase date keeps "Sold on" from going before it (the API checks it anyway).
  const purchasedAt = await api
    .getInventoryItem(listing.inventoryItemId)
    .then((item) => item.purchase.purchasedAt)
    .catch(() => undefined);
  return (
    <SellEditor
      initial={listing}
      marketplaces={marketplaces}
      context={plainContext(huntFormContext(session.user.locale))}
      purchasedAt={purchasedAt}
      today={new Date().toISOString()}
    />
  );
}
