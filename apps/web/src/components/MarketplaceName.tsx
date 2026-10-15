import type { MarketplaceKey } from "@rein-drop/api-client";
import { marketplaceByKey } from "@/marketing/marketplaces";
import { MarketplaceMark } from "@/marketing/marketplaces/MarketplaceMark";

/**
 * A marketplace's official logo next to its name, inside the app (the same files and rules as the
 * landing page, decision L-D6). The name is the accessible text; the logo is decorative.
 * `showName={false}`: logo only, with the name kept for screen readers.
 */
export function MarketplaceName({ marketplace, size = 16, showName = true }: { marketplace: MarketplaceKey; size?: number; showName?: boolean }) {
  return <MarketplaceMark marketplace={marketplaceByKey(marketplace)} size={size} showName={showName} />;
}
