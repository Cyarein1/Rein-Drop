import type { SourceHealth } from "@rein-drop/api-client";
import { sourceBanner } from "@rein-drop/client-core";
import { SystemBanner } from "@/components/ui";

/**
 * Calm status when a marketplace source is degraded while others continue (Screenbook frame 31,
 * "Source degraded"). Renders nothing when every source is working. Never an error banner.
 */
export function SourceBanner({ sources, now }: { sources: readonly SourceHealth[] | null; now: Date }) {
  const banner = sources ? sourceBanner(sources, now) : null;
  if (!banner) return null;
  return <SystemBanner tone={banner.tone} title={banner.title} message={banner.message} />;
}
