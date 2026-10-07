"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { Alert } from "@rein-drop/api-client";
import { alertView, unreadText } from "@rein-drop/client-core";
import { Badge, Button } from "@/components/ui";
import { readAlert, readAllAlerts } from "./actions";
import styles from "./alerts.module.css";

/** The in-app inbox: opening an alert marks it read and goes to its deal. */
export function AlertInbox({ initial, initialUnread }: { initial: Alert[]; initialUnread: number }) {
  const router = useRouter();
  const [alerts, setAlerts] = useState(initial);
  const [unread, setUnread] = useState(initialUnread);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const markLocal = (id: string) => {
    setAlerts((list) => list.map((a) => (a.id === id && !a.readAt ? { ...a, readAt: new Date().toISOString() } : a)));
    setUnread((n) => Math.max(0, n - (alerts.find((a) => a.id === id && !a.readAt) ? 1 : 0)));
  };

  const markAll = () =>
    startTransition(async () => {
      setError(null);
      const result = await readAllAlerts();
      if (!result.ok) return setError(result.message);
      setAlerts((list) => list.map((a) => (a.readAt ? a : { ...a, readAt: new Date().toISOString() })));
      setUnread(0);
      router.refresh(); // the bell's count
    });

  const open = (id: string) => {
    markLocal(id);
    // Best effort: the deal opens whether or not this lands.
    void readAlert(id);
  };

  return (
    <div className={styles.inbox}>
      <div className={styles.toolbar}>
        <p role="status">{unreadText(unread)}</p>
        {unread > 0 && (
          <Button variant="secondary" loading={pending} onClick={markAll}>
            Mark all read
          </Button>
        )}
      </div>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      <ul className={styles.list}>
        {alerts.map((alert) => {
          const view = alertView(alert);
          const content = (
            <>
              <span className={styles.meta}>
                {view.unread && <span className={styles.dot} aria-label="Unread" role="img" />}
                {view.exceptional ? <Badge tone="fresh">{view.kindLabel}</Badge> : <span>{view.kindLabel}</span>}
                <span>· {view.when}</span>
              </span>
              <span className={styles.title}>{view.title}</span>
              {view.body && <span className={styles.body}>{view.body}</span>}
            </>
          );
          return (
            <li key={view.id} className={[styles.item, view.unread && styles.unread, view.exceptional && styles.exceptional].filter(Boolean).join(" ")}>
              {view.dealId ? (
                <Link href={`/deals/${view.dealId}`} className={styles.link} onClick={() => open(view.id)}>
                  {content}
                </Link>
              ) : (
                <button type="button" className={styles.link} onClick={() => open(view.id)}>
                  {content}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
