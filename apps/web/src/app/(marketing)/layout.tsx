import type { ReactNode } from "react";

/**
 * Public marketing pages (the landing page at `/`; later /privacy and /terms). No AppShell and no
 * session read, so these pages stay static - the signed-in redirect on `/` happens in src/proxy.ts.
 * The root layout (src/app/layout.tsx) still provides the design tokens, Inter and base styles.
 */
export default function MarketingLayout({ children }: { children: ReactNode }) {
  return children;
}
