import { ChartColumn, House, Plus, Radar, Settings, Tag, type LucideIcon } from "lucide-react";
import type { FeatureKey } from "@rein-drop/api-client";

export interface NavItem {
  href: string;
  label: string;
  /** Shorter label for the mobile bottom bar. */
  shortLabel?: string;
  icon: LucideIcon;
  /** The platform capability this destination belongs to (contracts FEATURES, decision 0018). */
  feature: FeatureKey;
  /** Paths under this item that belong to a different destination. */
  excludes?: string[];
  /** Other paths that belong to this destination (e.g. Inventory under Analytics). */
  includes?: string[];
}

/** Primary destinations. One list drives the sidebar, top bar and bottom bar. */
export const NAV = {
  home: { href: "/home", label: "Home", icon: House, feature: "home.dashboard" },
  hunts: { href: "/hunts", label: "Hunts", icon: Radar, excludes: ["/hunts/new"], feature: "hunts.manage" },
  createHunt: { href: "/hunts/new", label: "Create Hunt", shortLabel: "Create", icon: Plus, feature: "hunts.create" },
  deals: { href: "/deals", label: "Deals", icon: Tag, feature: "deals" },
  // Inventory, Mark sold and Sale result sit with the outcome screens (screen map 21-24).
  analytics: { href: "/analytics", label: "Analytics", icon: ChartColumn, includes: ["/inventory"], feature: "analytics" },
  settings: { href: "/settings", label: "Settings", icon: Settings, feature: "account.access" },
} satisfies Record<string, NavItem>;

/** Desktop sidebar (Create Hunt is a separate, persistent primary action). */
export const SIDEBAR_ITEMS: NavItem[] = [NAV.home, NAV.hunts, NAV.deals, NAV.analytics, NAV.settings];

/**
 * Mobile bottom bar: Home - Hunts - central Create - Deals - Analytics
 * (Mobile UI Screenbook, section 1). Settings lives in the mobile top bar.
 */
export const BOTTOM_ITEMS: NavItem[] = [NAV.home, NAV.hunts, NAV.createHunt, NAV.deals, NAV.analytics];

/** True when `pathname` is the item's page or one of its sub-pages (minus excluded paths). */
export function isActive(pathname: string, item: NavItem): boolean {
  const path = pathname.replace(/\/+$/, "") || "/";
  const within = (base: string) => path === base || path.startsWith(`${base}/`);
  if ((item.includes ?? []).some(within)) return true;
  if (!within(item.href)) return false;
  return !(item.excludes ?? []).some(within);
}
