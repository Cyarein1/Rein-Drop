import type { Metadata } from "next";
import { connection } from "next/server";
import { huntFormContext, plainContext } from "@rein-drop/client-core";
import { verifySession } from "@/auth";
import { Protected } from "@/auth/Protected";
import { Page } from "@/components/ui";
import { AddItemForm } from "./AddItemForm";

export const metadata: Metadata = { title: "Add item" };

/** "Add item" (decision 0021): something bought outside Rein Drop; afterwards it works like any other item. */
export default function AddItemPage() {
  return (
    <Protected>
      <Page width="narrow">
        <AddItemLoader />
      </Page>
    </Protected>
  );
}

async function AddItemLoader() {
  await connection(); // "today" is per request
  const session = await verifySession();
  return <AddItemForm context={plainContext(huntFormContext(session.user.locale))} today={new Date().toISOString()} />;
}
