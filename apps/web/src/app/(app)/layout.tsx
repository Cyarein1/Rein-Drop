import type { ReactNode } from "react";
import { getSession } from "@/auth/session";
import { AppShell } from "@/components/shell/AppShell";

/** Authenticated area. TODO(auth): redirect to sign-in when there is no session. */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  return <AppShell session={session}>{children}</AppShell>;
}
