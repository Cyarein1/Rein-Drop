import Link from "next/link";
import { Bell } from "lucide-react";
import { getServerApiClient } from "@/auth";
import styles from "./AppShell.module.css";

/**
 * Inbox link with the unread count (Screenbook section 1: "notification bell ... only where
 * useful"). Streams in behind Suspense; if the count can't be loaded the bell still works.
 */
export async function AlertsBell() {
  const unread = await getServerApiClient()
    .then((api) => api.listAlerts({ limit: 1 }))
    .then((page) => page.unreadCount)
    .catch(() => 0);
  return <BellLink unread={unread} />;
}

export function BellLink({ unread }: { unread: number }) {
  return (
    <Link href="/alerts" className={styles.iconButton} aria-label={unread > 0 ? `Inbox, ${unread} unread` : "Inbox"}>
      <Bell aria-hidden="true" size={22} strokeWidth={2} />
      {unread > 0 && (
        <span className={styles.bellCount} aria-hidden="true">
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </Link>
  );
}
