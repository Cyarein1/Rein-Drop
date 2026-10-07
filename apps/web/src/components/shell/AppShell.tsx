import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { Wordmark } from "@/brand/Wordmark";
import { AccountSummary } from "./AccountSummary";
import { BottomNav, CreateHuntButton, SidebarNav, TopBarSettingsLink } from "./ShellNav";
import styles from "./AppShell.module.css";

/**
 * Authenticated web shell.
 * - >= 768px: left sidebar (wordmark, Create Hunt, destinations) + top bar (account).
 * - <  768px: top bar (wordmark, Settings) + fixed bottom navigation.
 * The shell itself is static; the session-dependent account area streams in behind
 * Suspense, and each page verifies the session itself (see `Protected`).
 */
export function AppShell({ children }: { children: ReactNode }) {
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
              <Suspense fallback={<span className={styles.avatar} aria-hidden="true" />}>
                <AccountSummary />
              </Suspense>
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
