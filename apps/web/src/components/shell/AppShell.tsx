import Link from "next/link";
import type { ReactNode } from "react";
import type { Session } from "@/auth/session";
import { Wordmark } from "@/brand/Wordmark";
import { Badge } from "@/components/ui";
import { BottomNav, CreateHuntButton, SidebarNav, TopBarSettingsLink } from "./ShellNav";
import styles from "./AppShell.module.css";

export interface AppShellProps {
  session: Session;
  children: ReactNode;
}

/**
 * Authenticated web shell.
 * - >= 768px: left sidebar (wordmark, Create Hunt, destinations) + top bar (account).
 * - <  768px: top bar (wordmark, Settings) + fixed bottom navigation.
 * Responsive switching is CSS-only; only one navigation is rendered visibly (and in
 * the accessibility tree) at a time.
 */
export function AppShell({ session, children }: AppShellProps) {
  const { email } = session.user;
  const name = session.user.displayName ?? email;

  return (
    <div className={styles.shell}>
      <a href="#main-content" className={styles.skipLink}>
        Skip to main content
      </a>

      <aside className={styles.sidebar}>
        <Link href="/home" className={styles.brandLink} aria-label="Rein Drop home">
          <Wordmark height={30} priority />
        </Link>
        <CreateHuntButton />
        <SidebarNav />
      </aside>

      <div className={styles.column}>
        <header className={styles.topBar}>
          <Link href="/home" className={`${styles.brandLink} ${styles.mobileOnly}`} aria-label="Rein Drop home">
            <Wordmark height={26} />
          </Link>
          <div className={styles.topBarEnd}>
            <div className={`${styles.account} ${styles.desktopOnly}`}>
              {session.isPlaceholder && <Badge tone="info">Placeholder session</Badge>}
              <span className={styles.avatar} aria-hidden="true">
                {name.charAt(0).toUpperCase()}
              </span>
              <span className={styles.accountEmail}>{email}</span>
            </div>
            <div className={styles.mobileOnly}>
              <TopBarSettingsLink />
            </div>
          </div>
        </header>

        <main id="main-content" tabIndex={-1} className={styles.main}>
          {children}
        </main>
      </div>

      <BottomNav />
    </div>
  );
}
