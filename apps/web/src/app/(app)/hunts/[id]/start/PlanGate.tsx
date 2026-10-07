"use client";

import { useState, useTransition } from "react";
import type { ActivationBlock, ActivationCheck, EntitlementEvaluation, Hunt, Plan } from "@rein-drop/api-client";
import {
  huntReview,
  planGateOptions,
  RESOLUTION_LABEL,
  type HuntFormContext,
  type PlanGateOption,
} from "@rein-drop/client-core";
import { Badge, Button, ButtonLink, Card, Page, SystemBanner } from "@/components/ui";
import { confirmPlanAndStart, startHunt } from "./actions";
import styles from "./PlanGate.module.css";

export interface PlanGateProps {
  hunt: Hunt;
  plans: Plan[];
  entitlements: EntitlementEvaluation;
  check: ActivationCheck;
  context: HuntFormContext;
}

type View =
  | { kind: "quick" }
  | { kind: "gate" }
  | { kind: "confirm"; option: PlanGateOption }
  | { kind: "live"; hunt: Hunt };

/**
 * Start watching (App Flow Blueprint sections 6-7). Plans, limits and the user's usage all
 * come from the server; pricing is shown as TBD and everything is marked as development data.
 */
export function PlanGate({ hunt, plans, entitlements, check, context }: PlanGateProps) {
  const hasPlan = entitlements.subscription !== null;
  const [view, setView] = useState<View>(
    hunt.status === "LIVE" ? { kind: "live", hunt } : hasPlan && check.canActivate ? { kind: "quick" } : { kind: "gate" },
  );
  const [block, setBlock] = useState<ActivationBlock | null>(
    hasPlan && !check.canActivate && check.reasons.length ? { planCode: check.planCode, reasons: check.reasons } : null,
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const options = planGateOptions(
    plans,
    hunt,
    entitlements.usage.activeHunts,
    entitlements.subscription?.planCode ?? null,
  );

  const handle = (action: () => ReturnType<typeof startHunt>) =>
    startTransition(async () => {
      setError(null);
      const result = await action();
      if (result.ok) {
        setView({ kind: "live", hunt: result.hunt });
        return;
      }
      setError(result.message);
      setBlock(result.block);
      if (result.block) setView({ kind: "gate" });
    });

  if (view.kind === "live") return <LiveView hunt={view.hunt} context={context} />;

  if (view.kind === "quick") {
    return (
      <Page title="Start watching" width="narrow">
        <Card>
          <p>{huntReview(hunt, context).sentence}</p>
        </Card>
        <p>
          You&apos;re on the <strong>{entitlements.plan.name}</strong> plan.
          {entitlements.remaining.activeHunts !== null &&
            ` ${entitlements.remaining.activeHunts} live ${entitlements.remaining.activeHunts === 1 ? "Hunt" : "Hunts"} left.`}
        </p>
        {error && <SystemBanner tone="error" title="Couldn't start" message={error} />}
        <div className={styles.actions}>
          <Button onClick={() => handle(() => startHunt(hunt.id))} loading={pending} fullWidth>
            Start watching
          </Button>
          <Button variant="secondary" onClick={() => setView({ kind: "gate" })} disabled={pending} fullWidth>
            Change plan
          </Button>
        </div>
      </Page>
    );
  }

  if (view.kind === "confirm") {
    const { option } = view;
    return (
      <Page title="Confirm your plan" width="narrow">
        <SystemBanner
          tone="warning"
          title="Development billing - no card, no charge"
          message="This stands in for real checkout while billing isn't built. Confirming records your plan choice only."
        />
        <Card title={option.plan.name} action={<Badge tone="neutral">{option.priceLabel}</Badge>}>
          <ul className={styles.lines}>
            {option.lines.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </Card>
        {error && <SystemBanner tone="error" title="Couldn't start" message={error} />}
        <div className={styles.actions}>
          <Button onClick={() => handle(() => confirmPlanAndStart(hunt.id, option.plan.code))} loading={pending} fullWidth>
            Confirm (development) and start watching
          </Button>
          <Button variant="secondary" onClick={() => setView({ kind: "gate" })} disabled={pending} fullWidth>
            Back to plans
          </Button>
        </div>
      </Page>
    );
  }

  return (
    <Page title="Choose a plan to start watching" description={`For “${hunt.name}”`}>
      <SystemBanner
        tone="info"
        title="Development data"
        message="Plans, limits and prices are placeholders while pricing is decided. No payment is taken."
      />
      {block && <BlockReasons block={block} />}
      {error && !block && <SystemBanner tone="error" title="Couldn't start" message={error} />}

      <ul className={styles.plans}>
        {options.map((option) => (
          <li key={option.plan.code}>
            <PlanCard option={option} onChoose={() => setView({ kind: "confirm", option })} />
          </li>
        ))}
      </ul>
      <ButtonLink href="/hunts" variant="text">
        Not now - keep it as a draft
      </ButtonLink>
    </Page>
  );
}

function PlanCard({ option, onChoose }: { option: PlanGateOption; onChoose: () => void }) {
  const { plan } = option;
  return (
    <Card
      title={plan.name}
      className={option.recommended ? styles.recommended : undefined}
      action={
        <span className={styles.badges}>
          {option.recommended && <Badge tone="action">Recommended</Badge>}
          {option.isCurrent && <Badge tone="info">Current</Badge>}
        </span>
      }
    >
      <p className={styles.price}>
        {option.priceLabel}
        {plan.pricing.status === "tbd" && <span className={styles.muted}> · pricing not decided yet</span>}
      </p>
      {!plan.limitsFinal && <Badge tone="fresh">Placeholder limits</Badge>}
      <ul className={styles.lines}>
        {option.lines.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
      {option.reasons.length > 0 && (
        <div className={styles.cannot}>
          <p className={styles.cannotTitle}>Can&apos;t run this Hunt:</p>
          <ul className={styles.lines}>
            {option.reasons.map((r) => (
              <li key={r.code}>{r.code === "NOT_READY" ? r.problems.join(" ") : r.message}</li>
            ))}
          </ul>
        </div>
      )}
      <Button
        variant={option.recommended ? "primary" : "secondary"}
        onClick={onChoose}
        disabled={!option.canRunHunt}
        fullWidth
      >
        Choose {plan.name}
      </Button>
    </Card>
  );
}

function BlockReasons({ block }: { block: ActivationBlock }) {
  return (
    <SystemBanner
      tone="warning"
      title="This Hunt can't start yet - it's saved as a draft"
      message={
        <ul className={styles.lines}>
          {block.reasons.map((r) => (
            <li key={r.code}>
              {r.code === "NOT_READY" ? r.problems.join(" ") : r.message}
              {r.resolutions.includes("pause_another_hunt") && (
                <>
                  {" "}
                  <a href="/hunts">{RESOLUTION_LABEL.pause_another_hunt}</a>
                </>
              )}
            </li>
          ))}
        </ul>
      }
    />
  );
}

function LiveView({ hunt, context }: { hunt: Hunt; context: HuntFormContext }) {
  const review = huntReview(hunt, context);
  return (
    <Page title="Your Hunt is live" width="narrow">
      <Card title={hunt.name} action={<Badge tone="action">Live</Badge>}>
        <p>{review.sentence}</p>
      </Card>
      <Card title="What happens next">
        <p>You can leave Rein Drop. We&apos;ll alert you when something worth reviewing appears.</p>
      </Card>
      <SystemBanner
        tone="info"
        title="Development note"
        message="The monitoring engine isn't built yet, so marketplaces are not actually being checked."
      />
      <div className={styles.actions}>
        <ButtonLink href="/hunts" fullWidth>
          Go to Hunts
        </ButtonLink>
        <ButtonLink href="/hunts/new" variant="secondary" fullWidth>
          Create another Hunt
        </ButtonLink>
      </div>
    </Page>
  );
}
