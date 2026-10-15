import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ApiError } from "@rein-drop/api-client";
import { huntFormContext, plainContext } from "@rein-drop/client-core";
import { getServerApiClient, verifySession } from "@/auth";
import { Protected } from "@/auth/Protected";
import { Page } from "@/components/ui";
import { DealDetailScreen } from "./DealDetailScreen";

export const metadata: Metadata = { title: "Deal" };

export default function DealPage({ params }: PageProps<"/deals/[id]">) {
  return (
    <Protected>
      <Page>
        <DealLoader params={params} />
      </Page>
    </Protected>
  );
}

async function DealLoader({ params }: { params: PageProps<"/deals/[id]">["params"] }) {
  const { id } = await params;
  const session = await verifySession();
  const api = await getServerApiClient();
  const deal = await api.getDeal(id).catch((err: unknown) => {
    // Unknown / someone else's / malformed id -> 404 page; anything else -> error boundary.
    if (err instanceof ApiError && (err.status === 404 || err.code === "VALIDATION_FAILED")) notFound();
    throw err;
  });
  return <DealDetailScreen initial={deal} context={plainContext(huntFormContext(session.user.locale))} />;
}
