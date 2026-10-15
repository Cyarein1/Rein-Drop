import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ApiError } from "@rein-drop/api-client";
import { huntFormContext } from "@rein-drop/client-core";
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
  const { id } = await params;
  const [session, api] = await Promise.all([verifySession(), getServerApiClient()]);
  const [listing, marketplaces] = await Promise.all([
    api.getSellListing(id).catch((err: unknown) => {
      if (err instanceof ApiError && (err.status === 404 || err.code === "VALIDATION_FAILED")) notFound();
      throw err;
    }),
    api.getSellMarketplaces(),
  ]);
  return <SellEditor initial={listing} marketplaces={marketplaces} localeTag={huntFormContext(session.user.locale).localeTag} />;
}
