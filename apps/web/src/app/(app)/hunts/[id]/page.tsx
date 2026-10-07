import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ApiError } from "@rein-drop/api-client";
import { huntFormContext } from "@rein-drop/client-core";
import { getServerApiClient, verifySession } from "@/auth";
import { Protected } from "@/auth/Protected";
import { Page } from "@/components/ui";
import { HuntDetail } from "./HuntDetail";

export const metadata: Metadata = { title: "Hunt" };

export default function HuntPage({ params, searchParams }: PageProps<"/hunts/[id]">) {
  return (
    <Protected>
      <Page>
        <HuntLoader params={params} searchParams={searchParams} />
      </Page>
    </Protected>
  );
}

async function HuntLoader({
  params,
  searchParams,
}: {
  params: PageProps<"/hunts/[id]">["params"];
  searchParams: PageProps<"/hunts/[id]">["searchParams"];
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const session = await verifySession();
  const api = await getServerApiClient();
  const [hunt, activity, events] = await Promise.all([api.getHunt(id), api.getHuntActivity(id), api.listHuntEvents(id)]).catch((err: unknown) => {
    // Unknown / someone else's / malformed id -> 404 page; anything else -> error boundary.
    if (err instanceof ApiError && (err.status === 404 || err.code === "VALIDATION_FAILED")) notFound();
    throw err;
  });
  return (
    <HuntDetail
      hunt={hunt}
      activity={activity}
      events={events}
      context={huntFormContext(session.user.locale)}
      saved={query.saved === "1"}
    />
  );
}
