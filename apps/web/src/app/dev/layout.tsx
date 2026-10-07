import type { ReactNode } from "react";

/** Developer-only pages (system status, UI gallery). Outside the app shell. */
export default function DevLayout({ children }: { children: ReactNode }) {
  return <main id="main-content">{children}</main>;
}
