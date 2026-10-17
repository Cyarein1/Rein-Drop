import type { Metadata } from "next";
import Link from "next/link";
import { accountDeletionText, huntFormContext } from "@rein-drop/client-core";
import { verifySession } from "@/auth";
import { Protected } from "@/auth/Protected";
import { Page } from "@/components/ui";
import { DeleteAccountForm } from "./DeleteAccountForm";

export const metadata: Metadata = { title: "Delete account" };

/**
 * Delete account (decision 0021; Apple 5.1.1(v), Google Play, GDPR): the one real erase. Says what
 * happens, cancels any paid plan immediately, asks to type DELETE, then signs out to a goodbye page.
 */
export default function DeleteAccountPage() {
  return (
    <Protected>
      <Page title="Delete account" width="narrow">
        <DeleteLoader />
      </Page>
    </Protected>
  );
}

async function DeleteLoader() {
  const session = await verifySession();
  const text = accountDeletionText(huntFormContext(session.user.locale).t);
  return (
    <>
      <Link href="/settings">← Settings</Link>
      <DeleteAccountForm text={text} email={session.user.email} />
    </>
  );
}
