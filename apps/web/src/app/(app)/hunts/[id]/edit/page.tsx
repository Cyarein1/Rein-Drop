import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ApiError } from "@rein-drop/api-client";
import { editContext, huntFormContext, huntFormValues } from "@rein-drop/client-core";
import { getServerApiClient, verifySession } from "@/auth";
import { Protected } from "@/auth/Protected";
import { ButtonLink, Page, SystemBanner } from "@/components/ui";
import { CreateHuntFlow } from "../../new/CreateHuntFlow";

export const metadata: Metadata = { title: "Edit Hunt" };

export default function EditHuntPage({ params }: PageProps<"/hunts/[id]/edit">) {
  return (
    <Protected>
      <EditHuntLoader params={params} />
    </Protected>
  );
}

/** Same form as Create Hunt, filled from the saved hunt. Archived hunts are read-only. */
async function EditHuntLoader({ params }: { params: PageProps<"/hunts/[id]/edit">["params"] }) {
  const { id } = await params;
  const session = await verifySession();
  const api = await getServerApiClient();
  const hunt = await api.getHunt(id).catch((err: unknown) => {
    if (err instanceof ApiError && (err.status === 404 || err.code === "VALIDATION_FAILED")) notFound();
    throw err;
  });
  if (hunt.status === "ARCHIVED") {
    return (
      <Page title="Edit Hunt" width="narrow">
        <SystemBanner
          tone="info"
          title="Archived Hunts can't be edited"
          message="Restore it first - it comes back paused, ready to edit."
          action={<ButtonLink href={`/hunts/${hunt.id}`} variant="secondary">Back to the Hunt</ButtonLink>}
        />
      </Page>
    );
  }
  const context = editContext(hunt, huntFormContext(session.user.locale));
  return (
    <CreateHuntFlow
      initialValues={huntFormValues(hunt, context)}
      context={context}
      prefilled={[]}
      queryPlaceholder=""
      editing={hunt}
    />
  );
}
