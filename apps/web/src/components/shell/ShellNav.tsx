"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BOTTOM_ITEMS, isActive, NAV, SIDEBAR_ITEMS, type NavItem } from "./nav";
import styles from "./AppShell.module.css";

function useIsActive() {
  const pathname = usePathname();
  return (item: NavItem) => isActive(pathname, item);
}

/** Desktop: persistent primary action (Screenbook section 11: "Persistent Create Hunt action"). */
export function CreateHuntButton() {
  const active = useIsActive()(NAV.createHunt);
  const Icon = NAV.createHunt.icon;
  return (
    <Link
      href={NAV.createHunt.href}
      className={styles.createButton}
      aria-current={active ? "page" : undefined}
    >
      <Icon aria-hidden="true" size={20} strokeWidth={2.5} />
      <span>{NAV.createHunt.label}</span>
    </Link>
  );
}

export function SidebarNav() {
  const active = useIsActive();
  return (
    <nav aria-label="Primary" className={styles.sidebarNav}>
      <ul>
        {SIDEBAR_ITEMS.map((item) => {
          const Icon = item.icon;
          const current = active(item);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={styles.sidebarLink}
                aria-current={current ? "page" : undefined}
              >
                <Icon aria-hidden="true" size={20} strokeWidth={current ? 2.5 : 2} />
                <span>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Mobile: Home - Hunts - central Create - Deals - Analytics. */
export function BottomNav() {
  const active = useIsActive();
  return (
    <nav aria-label="Primary" className={styles.bottomNav}>
      <ul>
        {BOTTOM_ITEMS.map((item) => {
          const Icon = item.icon;
          const current = active(item);
          const isCreate = item.href === NAV.createHunt.href;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={isCreate ? styles.bottomCreate : styles.bottomLink}
                aria-current={current ? "page" : undefined}
              >
                <span className={isCreate ? styles.bottomCreateIcon : undefined}>
                  <Icon aria-hidden="true" size={isCreate ? 24 : 22} strokeWidth={current || isCreate ? 2.5 : 2} />
                </span>
                <span className={styles.bottomLabel}>{item.shortLabel ?? item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Mobile top bar: Settings is not in the bottom bar, so it lives here. */
export function TopBarSettingsLink() {
  const current = useIsActive()(NAV.settings);
  const Icon = NAV.settings.icon;
  return (
    <Link
      href={NAV.settings.href}
      className={styles.iconButton}
      aria-current={current ? "page" : undefined}
      aria-label={NAV.settings.label}
    >
      <Icon aria-hidden="true" size={22} strokeWidth={current ? 2.5 : 2} />
    </Link>
  );
}
