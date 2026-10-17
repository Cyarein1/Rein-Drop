import type { Metadata } from "next";
import { connection } from "next/server";
import { huntFormContext, plainContext } from "@rein-drop/client-core";
import { verifySession } from "@/auth";
import { Protected } from "@/auth/Protected";
import { ButtonLink, Card, EmptyState, Page } from "@/components/ui";
import { itemHref } from "@/sell/routes";
import { loadInventoryItem } from "../../load-item";
import { MarkSoldForm } from "./MarkSoldForm";

export const metadata: Metadata = { title: "Mark sold" };

export default function MarkSoldPage({ params }: PageProps<"/sell/items/[id]/sold">) {
  return (
    <Protected>
      <Page>
        <SellLoader params={params} />
      </Page>
    </Protected>
  );
}

async function SellLoader({ params }: { params: PageProps<"/sell/items/[id]/sold">["params"] }) {
  await connection(); // "today" is per request
  const { id } = await params;
  const session = await verifySession();
  const item = await loadInventoryItem(id);
  if (!item.holding && !item.sale) {
    return (
      <Card>
        <EmptyState
          title="This item can't be marked sold"
          description="Only items you're holding can be sold."
          action={<ButtonLink href={itemHref(item.id)} variant="secondary">Back to the item</ButtonLink>}
        />
      </Card>
    );
  }
  return <MarkSoldForm item={item} context={plainContext(huntFormContext(session.user.locale))} today={new Date().toISOString()} />;
}
