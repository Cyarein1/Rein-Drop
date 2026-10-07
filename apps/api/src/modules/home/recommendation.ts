import type { HomeRecommendation, HuntActivity, HuntStatus, SellerSnapshotStatus } from '@rein-drop/contracts';

/**
 * The one recommendation on Home: the first rule that applies, from what's missing, to what's
 * wrong, to what could be better. Grounded in the user's own data - never generic advice and
 * never earnings promises (Mascot Usage Guide / Blueprint section 15).
 *
 * TODO(product): thresholds are proposed defaults.
 */
export const RECOMMENDATION_THRESHOLDS = Object.freeze({
  /** Failed checks in a row before a marketplace problem is worth surfacing. */
  sourceFailingChecks: 3,
  /** A live hunt that has found nothing for this long may be too narrow. */
  quietHuntHours: 24,
  /** This many open deals and not a single alert: the hunt may be too broad. */
  noisyHuntOpenDeals: 20,
});

export interface RecommendationHunt {
  id: string;
  name: string;
  status: HuntStatus;
  /** When it (last) went live - activatedAt or the latest resume. */
  liveSince: Date | null;
  createdAt: Date;
  activity: HuntActivity;
}

export interface RecommendationFacts {
  snapshot: SellerSnapshotStatus;
  /** Non-archived hunts. */
  hunts: readonly RecommendationHunt[];
  activePushDevices: number;
  now: Date;
}

const MARKETPLACE_NAME: Record<string, string> = { ebay: 'eBay', facebook: 'Facebook Marketplace' };

export function homeRecommendation(facts: RecommendationFacts, t = RECOMMENDATION_THRESHOLDS): HomeRecommendation | null {
  const { hunts } = facts;
  const live = hunts.filter((h) => h.status === 'LIVE');
  const newest = <T extends RecommendationHunt>(list: T[]) => [...list].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];

  if (facts.snapshot === 'not_started' || facts.snapshot === 'in_progress') {
    return {
      code: 'finish_setup',
      kind: 'setup',
      title: 'Finish setting up Rein Drop',
      body: 'Five quick questions set your Hunt defaults - your target, marketplaces and what you hunt for.',
      actionLabel: facts.snapshot === 'in_progress' ? 'Continue setup' : 'Start setup',
      target: { kind: 'onboarding' },
    };
  }
  if (hunts.length === 0) {
    return {
      code: 'create_first_hunt',
      kind: 'setup',
      title: 'Create your first Hunt',
      body: 'Tell Rein Drop what to watch for. It checks the marketplaces and only alerts you when something looks worth acting on.',
      actionLabel: 'Create Hunt',
      target: { kind: 'create_hunt' },
    };
  }
  if (live.length === 0) {
    const draft = newest(hunts.filter((h) => h.status === 'DRAFT'));
    if (draft) {
      return {
        code: 'start_draft',
        kind: 'setup',
        title: `"${draft.name}" isn't watching yet`,
        body: 'Nothing is being checked until a Hunt is live. Start watching when you are ready.',
        actionLabel: 'Start watching',
        target: { kind: 'start_hunt', huntId: draft.id },
      };
    }
    const paused = newest(hunts.filter((h) => h.status === 'PAUSED'));
    if (paused) {
      return {
        code: 'resume_hunt',
        kind: 'setup',
        title: 'All your Hunts are paused',
        body: `Rein Drop isn't checking anything right now. Resume "${paused.name}" to start watching again.`,
        actionLabel: 'Open Hunt',
        target: { kind: 'hunt', huntId: paused.id },
      };
    }
  }

  for (const hunt of live) {
    const failing = hunt.activity.marketplaces.filter((m) => m.lastCheck === 'failed' && m.failingChecks >= t.sourceFailingChecks);
    if (failing.length > 0) {
      const names = failing.map((m) => MARKETPLACE_NAME[m.marketplace] ?? m.marketplace).join(' and ');
      return {
        code: 'source_issue',
        kind: 'issue',
        title: `${names} checks are failing`,
        body: `The last ${failing[0]!.failingChecks} checks for "${hunt.name}" didn't work. Rein Drop keeps retrying; other marketplaces are unaffected.`,
        actionLabel: 'View Hunt',
        target: { kind: 'hunt', huntId: hunt.id },
      };
    }
  }

  for (const hunt of live) {
    const hoursLive = hunt.liveSince ? (facts.now.getTime() - hunt.liveSince.getTime()) / 3_600_000 : 0;
    if (!hunt.activity.scanning && hunt.activity.counts.deals === 0 && hoursLive >= t.quietHuntHours) {
      return {
        code: 'broaden_hunt',
        kind: 'suggestion',
        title: `"${hunt.name}" hasn't found anything yet`,
        body: `Nothing has matched in ${Math.floor(hoursLive)} hours. A higher max price, more conditions or shorter search words may help.`,
        actionLabel: 'Edit Hunt',
        target: { kind: 'edit_hunt', huntId: hunt.id },
      };
    }
  }

  for (const hunt of live) {
    if (hunt.activity.counts.toReview >= t.noisyHuntOpenDeals && hunt.activity.counts.alerts === 0) {
      return {
        code: 'tighten_hunt',
        kind: 'suggestion',
        title: `"${hunt.name}" finds a lot, but nothing strong`,
        body: `${hunt.activity.counts.toReview} deals to review and none good enough to alert you. A lower max price or a narrower condition would cut the noise.`,
        actionLabel: 'Edit Hunt',
        target: { kind: 'edit_hunt', huntId: hunt.id },
      };
    }
  }

  if (live.length > 0 && facts.activePushDevices === 0) {
    return {
      code: 'enable_push',
      kind: 'suggestion',
      title: 'Get alerts on your phone',
      body: 'Alerts land in your inbox. Turn on notifications in the Rein Drop app so you can act on a good deal quickly.',
      actionLabel: 'Notification settings',
      target: { kind: 'notifications' },
    };
  }
  return null;
}
