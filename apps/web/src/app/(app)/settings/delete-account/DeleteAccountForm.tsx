"use client";

import Link from "next/link";
import { useId, useRef, useState, useTransition } from "react";
import { deletionConfirmed, type AccountDeletionText } from "@rein-drop/client-core";
import { Button, Card, SystemBanner, TextInput } from "@/components/ui";
import { deleteMyAccount } from "./actions";

/**
 * Type DELETE, then "Delete my account". On success the browser signs out (POST /auth/sign-out,
 * then=goodbye) - with Entra a later sign-in would otherwise create a new, empty account.
 */
export function DeleteAccountForm({ text, email }: { text: AccountDeletionText; email: string }) {
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [pending, startTransition] = useTransition();
  const signOut = useRef<HTMLFormElement>(null);
  const confirmId = useId();
  const ready = deletionConfirmed(typed);

  return (
    <Card title={text.title}>
      <p>
        Account: <strong>{email}</strong>
      </p>
      {text.paragraphs.map((p) => (
        <p key={p}>{p}</p>
      ))}
      <p style={{ color: "var(--rd-text-muted)", fontSize: 14 }}>
        Billing: a paid plan bought on the web is cancelled immediately when the account is deleted - no further charges, no refund for the rest of the period. Your past invoices stay with our payment provider (Stripe).
      </p>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (!ready) {
            setError(text.typeToConfirm);
            return;
          }
          setError(null);
          setStatus(text.progress);
          startTransition(async () => {
            const r = await deleteMyAccount();
            if (!r.ok) {
              setStatus("");
              setError(r.message);
              return;
            }
            setStatus(text.done);
            // Sign out of the (now deleted) account and land on the goodbye page.
            signOut.current?.requestSubmit();
          });
        }}
        style={{ display: "grid", gap: 16 }}
      >
        <TextInput id={confirmId} label={text.typeToConfirm} value={typed} autoComplete="off" autoCapitalize="characters" spellCheck={false} onChange={(e) => setTyped(e.target.value)} />
        {error && <SystemBanner tone="error" title="Your account wasn't deleted" message={error} />}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
          <Button type="submit" variant="destructive" loading={pending}>
            {text.confirmLabel}
          </Button>
          <Link href="/settings">{text.cancelLabel}</Link>
        </div>
        <p role="status" aria-live="polite" style={{ margin: 0 }}>
          {status}
        </p>
      </form>
      <form ref={signOut} action="/auth/sign-out" method="post" hidden>
        <input type="hidden" name="then" value="goodbye" />
      </form>
    </Card>
  );
}
