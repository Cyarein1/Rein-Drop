import type { ReactNode } from "react";
import { AppShell } from "@/components/shell/AppShell";

/**
 * Authenticated area. Protection is layered (Next.js auth guide):
 *  1. src/proxy.ts - optimistic redirect to /sign-in before rendering.
 *  2. <Protected> in every page - verifySession() per request (the real check).
 * No session read here: layouts do not re-render on client navigation.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
