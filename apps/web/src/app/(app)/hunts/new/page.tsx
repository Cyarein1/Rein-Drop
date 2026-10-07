import type { Metadata } from "next";
import { huntFormDefaults, queryPlaceholder } from "@rein-drop/client-core";
import { getServerApiClient, verifySession } from "@/auth";
import { Protected } from "@/auth/Protected";
import { CreateHuntFlow } from "./CreateHuntFlow";

export const metadata: Metadata = { title: "Create Hunt" };

export default function CreateHuntPage() {
  return (
    <Protected>
      <CreateHuntLoader />
    </Protected>
  );
}

/** Loads the Seller Snapshot + locale so the form starts with sensible, visible defaults. */
async function CreateHuntLoader() {
  const session = await verifySession();
  const api = await getServerApiClient();
  // The snapshot only provides defaults - the form still works without it.
  const snapshot = await api.getSellerSnapshot().catch(() => null);
  const { values, context, prefilled } = huntFormDefaults(snapshot, session.user.locale);

  return (
    <CreateHuntFlow
      initialValues={values}
      context={context}
      prefilled={prefilled}
      queryPlaceholder={queryPlaceholder(snapshot)}
    />
  );
}
