"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import type { ActivationBlock, ActivationCheck, BillingInfo, EntitlementEvaluation, Hunt, Plan } from "@rein-drop/api-client";
import {
  huntReview,
  planGateOptions,
  RESOLUTION_LABEL,
  type HuntFormContext,
  type PlanGateOption,
} from "@rein-drop/client-core";
import { Badge, Button, ButtonLink, Card, Page, SystemBanner } from "@/components/ui";
import { openBillingPortal } from "../../../billing-actions";
import { chooseFreeAndStart, confirmPlanAndStart, goToCheckout, startHunt } from "./actions";
import styles from "./PlanGate.module.css";

export interface PlanGateProps {
  hunt: Hunt;
  plans: Plan[];
  entitlements: EntitlementEvaluation;
  check: ActivationCheck;
  context: HuntFormContext;
  billing: BillingInfo;
  /** Back from Stripe Checkout (?checkout=success|cancelled). */
  checkout: "success" | "cancelled" | null;
}

type View =
  | { kind: "confirming" }
  | { kind: "quick" }
  | { kind: "gate" }
  | { kind: "confirm"; option: PlanGateOption }
  | { kind: "live"; hunt: Hunt };

/**
 * Start watching (App Flow Blueprint sections 6-7). Plans, prices, limits and the user's usage all
 * come from the server. Free needs no card; paid plans go through Stripe Checkout, and the plan
 * changes only when Stripe confirms the payment (server-owned entitlements, decision 0014).
 */
export function PlanGate({ hunt, plans, entitlements, check, context, billing, checkout }: PlanGateProps) {
  const hasPlan = entitlements.subscription !== null;
  const paidByStripe = entitlements.subscription?.provider === "stripe";
  const awaitingPayment = checkout === "success" && !paidByStripe;
  const [view, setView] = useState<View>(
    hunt.status === "LIVE"
      ? { kind: "live", hunt }
      : awaitingPayment
        ? { kind: "confirming" }
        : hasPlan && check.canActivate
          ? { kind: "quick" }
          : { kind: "gate" },
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
    context.localeTag,
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
  if (view.kind === "confirming") return <ConfirmingPayment onGiveUp={() => setView({ kind: "gate" })} />;

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
    const isFree = option.plan.pricing.status === "free";
    const stripe = billing.mode === "stripe";
    const returnPath = "/hunts/" + hunt.id + "/start";
    const confirm = isFree
      ? { label: "Choose Free and start watching", run: () => chooseFreeAndStart(hunt.id) }
      : !stripe
        ? { label: "Confirm (development) and start watching", run: () => confirmPlanAndStart(hunt.id, option.plan.code) }
        : paidByStripe
          ? {
              label: "Change plan in billing",
              run: async () => ({ ok: false as const, block: null, message: (await openBillingPortal("change_plan", returnPath)).error }),
            }
          : { label: "Continue to secure checkout", run: () => goToCheckout(hunt.id, option.plan.code) };
    return (
      <Page title="Confirm your plan" width="narrow">
        {isFree ? (
          <SystemBanner tone="info" title="Free - no card, no charge" message="You can upgrade later if you need more live Hunts or marketplaces." />
        ) : stripe ? (
          <SystemBanner
            tone="info"
            title={paidByStripe ? "You already have a paid plan" : "Secure checkout by Stripe"}
            message={
              paidByStripe
                ? "Plan changes happen in billing; your Hunts pick up the new plan as soon as it's confirmed."
                : "You'll pay " + option.priceLabel + " on Stripe's checkout page and come back here to start watching. Cancel any time in Settings."
            }
          />
        ) : (
          <SystemBanner
            tone="warning"
            title="Development billing - no card, no charge"
            message="This stands in for real checkout in development. Confirming records your plan choice only."
          />
        )}
        <Card title={option.plan.name} action={<Badge tone="neutral">{option.priceLabel}</Badge>}>
          <ul className={styles.lines}>
            {option.lines.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </Card>
        {error && <SystemBanner tone="error" title="Couldn't start" message={error} />}
        <div className={styles.actions}>
          <Button onClick={() => handle(confirm.run)} loading={pending} fullWidth>
            {confirm.label}
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
      {checkout === "cancelled" && <SystemBanner tone="info" title="Checkout cancelled" message="You weren't charged. Choose a plan when you're ready." />}
      {billing.mode === "development" && (
        <SystemBanner
          tone="info"
          title="Development data"
          message="Plans, limits and prices are placeholders while pricing is decided. No payment is taken."
        />
      )}
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
        disabled={!option.canRunHunt || !option.available}
        fullWidth
      >
        Choose {plan.name}
      </Button>
    </Card>
  );
}

/**
 * Back from Stripe Checkout: the payment is confirmed by Stripe's webhook, usually within seconds.
 * Re-reads the page every 2 s (up to a minute) until the plan shows up.
 */
function ConfirmingPayment({ onGiveUp }: { onGiveUp: () => void }) {
  const router = useRouter();
  const [tries, setTries] = useState(0);
  const tooLong = tries >= 30;
  useEffect(() => {
    if (tooLong) return;
    const timer = setTimeout(() => {
      setTries((n) => n + 1);
      router.refresh();
    }, 2000);
    return () => clearTimeout(timer);
  }, [tries, tooLong, router]);
  return (
    <Page title="Confirming your payment" width="narrow">
      {tooLong ? (
        <SystemBanner
          tone="warning"
          title="Still waiting for confirmation"
          message="Stripe hasn't confirmed the payment yet. You won't be charged twice - check Settings in a few minutes."
          action={
            <Button variant="secondary" onClick={onGiveUp}>
              Back to plans
            </Button>
          }
        />
      ) : (
        <SystemBanner tone="info" title="Thanks - confirming with Stripe..." message="This usually takes a few seconds. Your Hunt starts right after." />
      )}
    </Page>
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
                  <Link href="/hunts?status=LIVE">{RESOLUTION_LABEL.pause_another_hunt}</Link>
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
        <p>
          Alerts land in your <Link href="/alerts">inbox</Link>. To get them as notifications, open the Rein Drop app on your
          phone and turn notifications on.
        </p>
      </Card>
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
