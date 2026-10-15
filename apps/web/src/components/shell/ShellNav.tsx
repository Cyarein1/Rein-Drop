"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { BOTTOM_ITEMS, isActive, NAV, SIDEBAR_ITEMS, TOP_BAR_ITEMS, type NavItem } from "./nav";
import styles from "./AppShell.module.css";

/**
 * Navigation pieces. Each renders from a `pathname` prop; the exported components read the
 * current path with `usePathname()` inside <Suspense> (required on dynamic routes with Cache
 * Components) and fall back to the same links without an active state while it streams.
 */

type PathProps = { pathname: string | null };
const active = (pathname: string | null, item: NavItem) => pathname !== null && isActive(pathname, item);

function withPathname(Component: (props: PathProps) => React.ReactNode) {
  function Live() {
    return <Component pathname={usePathname()} />;
  }
  return function NavWithPath() {
    return (
      <Suspense fallback={<Component pathname={null} />}>
        <Live />
      </Suspense>
    );
  };
}

function CreateHuntButtonView({ pathname }: PathProps) {
  const current = active(pathname, NAV.createHunt);
  const Icon = NAV.createHunt.icon;
  return (
    <Link href={NAV.createHunt.href} className={styles.createButton} aria-current={current ? "page" : undefined}>
      <Icon aria-hidden="true" size={20} strokeWidth={2.5} />
      <span>{NAV.createHunt.label}</span>
    </Link>
  );
}

function SidebarNavView({ pathname }: PathProps) {
  return (
    <nav aria-label="Primary" className={styles.sidebarNav}>
      <ul>
        {SIDEBAR_ITEMS.map((item) => {
          const Icon = item.icon;
          const current = active(pathname, item);
          return (
            <li key={item.href}>
              <Link href={item.href} className={styles.sidebarLink} aria-current={current ? "page" : undefined}>
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
function BottomNavView({ pathname }: PathProps) {
  return (
    <nav aria-label="Primary" className={styles.bottomNav}>
      <ul>
        {BOTTOM_ITEMS.map((item) => {
          const Icon = item.icon;
          const current = active(pathname, item);
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

/** Mobile top bar: destinations not in the bottom bar (Sell, Settings) live here. */
function TopBarSettingsLinkView({ pathname }: PathProps) {
  return (
    <>
      {TOP_BAR_ITEMS.map((item) => {
        const current = active(pathname, item);
        const Icon = item.icon;
        return (
          <Link key={item.href} href={item.href} className={styles.iconButton} aria-current={current ? "page" : undefined} aria-label={item.label}>
            <Icon aria-hidden="true" size={22} strokeWidth={current ? 2.5 : 2} />
          </Link>
        );
      })}
    </>
  );
}

/** Desktop: persistent primary action (Screenbook section 11). */
export const CreateHuntButton = withPathname(CreateHuntButtonView);
export const SidebarNav = withPathname(SidebarNavView);
export const BottomNav = withPathname(BottomNavView);
export const TopBarSettingsLink = withPathname(TopBarSettingsLinkView);
