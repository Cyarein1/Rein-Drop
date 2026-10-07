"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import type { Hunt, HuntActivity, HuntEvent } from "@rein-drop/api-client";
import {
  ageText,
  HUNT_ACTION_CONFIRM,
  HUNT_ACTION_LABEL,
  HUNT_EVENT_LABEL,
  HUNT_STATUS_LABEL,
  huntActions,
  huntCriteria,
  marketplaceRows,
  monitoringLine,
  type HuntDetailAction,
  type HuntFormContext,
} from "@rein-drop/client-core";
import { mascotAssets } from "@/brand/assets";
import { Badge, Button, ButtonLink, Card, Metric, Spinner, SystemBanner } from "@/components/ui";
import { transitionHuntAction } from "./actions";
import styles from "../hunts.module.css";

type Transition = "pause" | "resume" | "archive" | "restore";
const DONE: Record<Transition, string> = {
  pause: "Paused - nothing is checked until you resume.",
  resume: "Resumed - Rein Drop is watching again.",
  archive: "Archived. Restore it any time from Archived.",
  restore: "Restored as paused. Resume it when you want it to watch again.",
};

/** While the first scan runs, look again this often (stops once it's done). */
const SCAN_REFRESH_MS = 10_000;

/**
 * Hunt detail: state and monitoring per marketplace, simple performance counts, the criteria,
 * history, and Edit / Pause / Resume / Archive / Restore / Start watching. No Hot Hunt purchase.
 */
export function HuntDetail({
  hunt: loaded,
  activity,
  events,
  context,
  saved,
}: {
  hunt: Hunt;
  activity: HuntActivity;
  events: HuntEvent[];
  context: HuntFormContext;
  saved: boolean;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState<Transition | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(saved ? { tone: "success", text: "Changes saved." } : null);
  const [pending, startTransition] = useTransition();
  // One "now" per render cycle of this screen (render stays pure).
  const [now] = useState(() => new Date());
  // The hunt the last action returned, until the refreshed server copy catches up with it.
  const [returned, setReturned] = useState<Hunt | null>(null);
  const hunt = returned && returned.updatedAt >= loaded.updatedAt ? returned : loaded;
  const status = HUNT_STATUS_LABEL[hunt.status];
  const monitoring = monitoringLine(hunt, activity, now);
  const criteria = huntCriteria(hunt, context);

  // First scan: refresh until every marketplace has been checked once.
  useEffect(() => {
    if (!activity.scanning) return;
    const timer = setInterval(() => router.refresh(), SCAN_REFRESH_MS);
    return () => clearInterval(timer);
  }, [activity.scanning, router]);

  const run = (action: Transition) =>
    startTransition(async () => {
      setNotice(null);
      const result = await transitionHuntAction(hunt.id, action);
      setConfirming(null);
      if (!result.ok) return setNotice({ tone: "error", text: result.message });
      setReturned(result.hunt);
      setNotice({ tone: "success", text: action === "restore" && result.hunt.status === "DRAFT" ? "Restored as a draft." : DONE[action] });
      router.refresh();
    });

  const actionButton = (action: HuntDetailAction) => {
    switch (action) {
      case "start":
        return <ButtonLink key={action} href={`/hunts/${hunt.id}/start`}>Start watching</ButtonLink>;
      case "edit":
        return <ButtonLink key={action} href={`/hunts/${hunt.id}/edit`} variant="secondary">Edit</ButtonLink>;
      case "resume":
      case "restore":
        return (
          <Button key={action} variant={action === "resume" ? "primary" : "secondary"} loading={pending} onClick={() => run(action)}>
            {HUNT_ACTION_LABEL[action]}
          </Button>
        );
      case "pause":
      case "archive":
        return (
          <Button key={action} variant={action === "archive" ? "text" : "secondary"} disabled={pending} onClick={() => setConfirming(action)}>
            {HUNT_ACTION_LABEL[action]}
          </Button>
        );
      default:
        return null;
    }
  };
  const art = mascotAssets.working;

  return (
    <div className={styles.detail}>
      <Link href="/hunts" className={styles.back}>
        ← All Hunts
      </Link>
      <div className={styles.heading}>
        <h1 className={styles.title}>{hunt.name}</h1>
        <Badge tone={status.tone}>{status.label}</Badge>
      </div>

      {activity.scanning ? (
        <div className={styles.scanning} role="status">
          {/* Approved "working" mascot only; none exists yet, so the normal loading UI. */}
          {art ? <Image src={art} alt="" width={64} height={64} /> : <Spinner />}
          <div>
            <strong>{monitoring.text}</strong>
            <p className={styles.meta}>Your first results usually appear within a few minutes. This page updates by itself.</p>
          </div>
        </div>
      ) : (
        <p className={styles.monitoring} data-tone={monitoring.tone}>
          {monitoring.text}
        </p>
      )}

      {notice && (
        <SystemBanner tone={notice.tone === "error" ? "error" : "success"} title={notice.tone === "error" ? "That didn't work" : notice.text} message={notice.tone === "error" ? notice.text : undefined} />
      )}

      <div className={styles.actions}>{huntActions(hunt.status).map(actionButton)}</div>
      {confirming && (
        <div className={styles.confirm} role="group" aria-label={`Confirm ${HUNT_ACTION_LABEL[confirming].toLowerCase()}`}>
          <p>{HUNT_ACTION_CONFIRM[confirming]}</p>
          <div className={styles.actions}>
            <Button variant={confirming === "archive" ? "destructive" : "primary"} loading={pending} onClick={() => run(confirming)}>
              {HUNT_ACTION_LABEL[confirming]} Hunt
            </Button>
            <Button variant="text" onClick={() => setConfirming(null)} disabled={pending}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      <Card title="Performance" action={activity.counts.deals > 0 ? <ButtonLink href={`/deals?hunt=${hunt.id}`} variant="text">Open deals</ButtonLink> : undefined}>
        <div className={styles.metrics}>
          <Metric label="Deals found" value={String(activity.counts.deals)} />
          <Metric label="To review" value={String(activity.counts.toReview)} />
          <Metric label="Alerts" value={String(activity.counts.alerts)} />
          <Metric label="Saved" value={String(activity.counts.saved)} />
          <Metric label="Bought" value={String(activity.counts.bought)} />
        </div>
      </Card>

      <Card title="Monitoring">
        {hunt.status === "DRAFT" ? (
          <p className={styles.meta}>Not watching yet - start watching to begin checking marketplaces.</p>
        ) : (
          <dl className={styles.rows}>
            {marketplaceRows(hunt, activity, now).map((row) => (
              <div key={row.name} className={styles.row}>
                <dt>
                  <strong>{row.name}</strong>
                </dt>
                <dd>
                  <Badge tone={row.status.tone}>{row.status.label}</Badge> <span className={styles.meta}>{row.detail}</span>
                </dd>
              </div>
            ))}
          </dl>
        )}
        <p className={styles.meta}>Priority: Normal</p>
      </Card>

      <Card title="What Rein Drop watches for">
        <p>{criteria.sentence}</p>
        <dl className={styles.rows}>
          {criteria.items.map((item) => (
            <div key={item.label} className={styles.row}>
              <dt className={styles.meta}>{item.label}</dt>
              <dd>{item.value}</dd>
            </div>
          ))}
        </dl>
        {criteria.warnings.map((w) => (
          <SystemBanner key={w} tone="warning" title="Before this Hunt can watch" message={w} />
        ))}
      </Card>

      <Card title="History">
        <ul className={styles.rows}>
          {[...events].reverse().map((e) => (
            <li key={e.id} className={styles.row}>
              <span>{HUNT_EVENT_LABEL[e.type]}</span>
              <span className={styles.meta}>{ageText(Math.max(0, Math.floor((now.getTime() - Date.parse(e.createdAt)) / 60_000)))}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
