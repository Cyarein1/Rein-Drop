import { SystemBanner } from "@/components/ui";

/** Marks a screen as intentional placeholder content so nobody mistakes it for a finished feature. */
export function PlaceholderNotice({ children }: { children: string }) {
  return <SystemBanner tone="info" title="Placeholder screen" message={children} />;
}
