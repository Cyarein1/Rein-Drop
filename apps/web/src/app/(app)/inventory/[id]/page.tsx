import type { Metadata } from "next";
import { huntFormContext } from "@rein-drop/client-core";
import { verifySession } from "@/auth";
import { Protected } from "@/auth/Protected";
import { Page } from "@/components/ui";
import { loadInventoryItem } from "../load-item";
import { InventoryDetail } from "./InventoryDetail";

export const metadata: Metadata = { title: "Inventory item" };

export default function InventoryItemPage({ params }: PageProps<"/inventory/[id]">) {
  return (
    <Protected>
      <Page>
        <ItemLoader params={params} />
      </Page>
    </Protected>
  );
}

async function ItemLoader({ params }: { params: PageProps<"/inventory/[id]">["params"] }) {
  const { id } = await params;
  const session = await verifySession();
  const item = await loadInventoryItem(id);
  return <InventoryDetail initial={item} context={huntFormContext(session.user.locale)} />;
}
