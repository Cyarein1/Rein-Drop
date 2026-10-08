import type { CandidateAnalysisResult } from '@rein-drop/ai-core';
import type {
  DealAssessment,
  DealDetail,
  DealEstimate,
  DealFreshness,
  DealPrice,
  DealStatus,
  DealSummary,
  ListingStatus,
  MarketplaceKey,
  SourceStatus,
} from '@rein-drop/contracts';
import type { DealAnalysis, HuntMatch, HuntMatchStatus, Listing, PollStatus } from '@rein-drop/db';
import { lastCheckOf } from '../hunts/hunt-activity.js';
import type { AlertEligibility, DealEconomics, ScoreReason } from '@rein-drop/scoring';

/** Everything one deal is built from (loaded by DealsService). */
export interface DealRow {
  match: Pick<HuntMatch, 'id' | 'status' | 'matchedAt' | 'reasons' | 'seenAt' | 'dismissedAt' | 'dismissReason' | 'boughtAt'>;
  hunt: { id: string; name: string };
  listing: Listing & { marketplace: { key: string } };
  /** Latest analysis of the match (any status), or null. */
  analysis: DealAnalysis | null;
  savedAt: Date | null;
  /** Latest search of the listing's marketplace for this hunt. */
  poll: { lastPolledAt: Date | null; lastPollStatus: PollStatus | null } | null;
  inventoryItemId: string | null;
  rank: number;
  /** The marketplace source's own health right now. */
  sourceHealth: SourceStatus;
}

/** Stored DealAnalysis.scoring (see the worker's DealAnalysisHandler). */
interface StoredScoring {
  strengthReasons: ScoreReason[];
  confidenceReasons: ScoreReason[];
  alert: AlertEligibility;
}

const AVAILABLE: ReadonlySet<ListingStatus> = new Set(['ACTIVE', 'UNKNOWN']);

/** bought > ignored > unavailable > saved > new > seen (same precedence as the feed filter SQL). */
export function dealStatus(matchStatus: HuntMatchStatus, listingStatus: ListingStatus, isSaved: boolean): DealStatus {
  if (matchStatus === 'BOUGHT') return 'bought';
  if (matchStatus === 'DISMISSED') return 'ignored';
  if (matchStatus === 'EXPIRED' || !AVAILABLE.has(listingStatus)) return 'unavailable';
  if (isSaved) return 'saved';
  return matchStatus === 'NEW' ? 'new' : 'seen';
}

export function freshnessOf(listing: Pick<Listing, 'listedAt' | 'firstSeenAt'>, asOf: Date): DealFreshness {
  const from = listing.listedAt ?? listing.firstSeenAt;
  return {
    postedAt: listing.listedAt?.toISOString() ?? null,
    discoveredAt: listing.firstSeenAt.toISOString(),
    ageMinutes: Math.max(0, Math.floor((asOf.getTime() - from.getTime()) / 60_000)),
    basis: listing.listedAt ? 'posted' : 'discovered',
  };
}

export function toDealSummary(row: DealRow, asOf: Date): DealSummary {
  const { match, listing, analysis } = row;
  const economics = analysis?.economics as DealEconomics | null | undefined;
  const result = analysis?.status === 'COMPLETED' ? (analysis.result as CandidateAnalysisResult | null) : null;
  const status = listing.status as ListingStatus;
  return {
    id: match.id,
    hunt: row.hunt,
    status: dealStatus(match.status, status, row.savedAt !== null),
    matchStatus: match.status,
    isSaved: row.savedAt !== null,
    matchedAt: match.matchedAt.toISOString(),
    listing: {
      id: listing.id,
      marketplace: listing.marketplace.key as MarketplaceKey,
      url: listing.url,
      title: listing.title,
      price: priceOf(listing),
      conditionText: listing.conditionText,
      locationText: listing.locationText,
      imageUrl: listing.imageUrls[0] ?? null,
      status,
      listedAt: listing.listedAt?.toISOString() ?? null,
      lastSeenAt: listing.lastSeenAt.toISOString(),
    },
    price: dealPrice(listing, economics ?? null),
    freshness: freshnessOf(listing, asOf),
    source: {
      marketplace: listing.marketplace.key as MarketplaceKey,
      listingStatus: status,
      available: AVAILABLE.has(status),
      lastSeenAt: listing.lastSeenAt.toISOString(),
      lastCheckedAt: row.poll?.lastPolledAt?.toISOString() ?? null,
      lastCheck: lastCheckOf(row.poll?.lastPollStatus ?? null),
      sourceHealth: row.sourceHealth,
    },
    assessment: assessmentOf(analysis),
    estimate: estimateOf(economics ?? null),
    reason: result?.explanation.headline ?? null,
    rank: row.rank,
  };
}

export function toDealDetail(row: DealRow, asOf: Date): DealDetail {
  const summary = toDealSummary(row, asOf);
  const { analysis, listing, match } = row;
  const result = analysis?.status === 'COMPLETED' ? (analysis.result as CandidateAnalysisResult | null) : null;
  const scoring = analysis?.scoring as StoredScoring | null | undefined;
  const economics = analysis?.economics as DealEconomics | null | undefined;
  const checks = Array.isArray(match.reasons) ? (match.reasons as { check: string; outcome: string; detail: string }[]) : [];
  return {
    ...summary,
    listing: { ...summary.listing, description: listing.description, imageUrls: listing.imageUrls },
    why: result
      ? {
          headline: result.explanation.headline,
          summary: result.explanation.summary,
          positives: result.explanation.positives.map((p) => p.text),
          concerns: result.explanation.concerns.map((p) => p.text),
          nextStep: result.explanation.nextStep,
          questionsForSeller: result.explanation.questionsForSeller,
        }
      : null,
    product: result
      ? {
          name: result.product.normalizedName,
          fit: result.product.queryFit,
          fitNote: result.product.queryFitNote,
          confidence: result.product.confidence,
        }
      : null,
    risk: result
      ? {
          level: result.risk.riskLevel,
          condition: result.risk.conditionCategory,
          factors: result.risk.riskFactors.map(({ code, severity, note }) => ({ code, severity, note })),
          missingInformation: result.risk.missingInformation,
          seller: result.risk.seller,
        }
      : null,
    strengthReasons: scoring?.strengthReasons ?? [],
    confidenceReasons: scoring?.confidenceReasons ?? [],
    economics: economics
      ? {
          knownCosts: economics.knownCosts.map(({ kind, label, amount }) => ({ kind, label, amount })),
          notIncluded: economics.notIncluded,
          maxPrice: economics.maxPrice
            ? economics.maxPrice.status === 'unverified'
              ? { limit: economics.maxPrice.limit, status: 'unverified', withKnownCosts: null, headroom: null }
              : {
                  limit: economics.maxPrice.limit,
                  status: economics.maxPrice.status,
                  withKnownCosts: economics.maxPrice.withKnownCosts,
                  headroom: economics.maxPrice.headroom,
                }
            : null,
          target: economics.target ? { status: economics.target.status, detail: economics.target.detail } : null,
        }
      : null,
    matchChecks: checks.map(({ check, outcome, detail }) => ({ check, outcome: outcome as DealDetail['matchChecks'][number]['outcome'], detail })),
    alert: scoring?.alert
      ? {
          eligible: scoring.alert.eligible,
          kind: scoring.alert.kind,
          rules: scoring.alert.rules.map(({ rule, passed, detail }) => ({ rule, passed, detail })),
        }
      : null,
    decision: {
      seenAt: match.seenAt?.toISOString() ?? null,
      savedAt: row.savedAt?.toISOString() ?? null,
      ignoredAt: match.dismissedAt?.toISOString() ?? null,
      ignoreReason: match.dismissReason,
      boughtAt: match.boughtAt?.toISOString() ?? null,
      inventoryItemId: row.inventoryItemId,
    },
  };
}

function priceOf(listing: Pick<Listing, 'priceMinor' | 'currency'>) {
  return listing.priceMinor !== null && listing.currency ? { amountMinor: listing.priceMinor, currency: listing.currency } : null;
}

/** From the analysis economics when there is one; otherwise just the asking price. */
function dealPrice(listing: Listing, economics: DealEconomics | null): DealPrice {
  const asking = priceOf(listing);
  if (!economics || !asking || !economics.knownTotalCost) return { asking, knownCosts: null, knownTotal: asking };
  const costs = economics.knownCosts.reduce((sum, c) => sum + c.amount.amountMinor, 0);
  return {
    asking,
    knownCosts: economics.knownCosts.length > 0 ? { amountMinor: costs, currency: asking.currency } : null,
    knownTotal: economics.knownTotalCost,
  };
}

const NOT_ANALYSED = { status: 'unavailable', reason: 'not_analyzed', detail: 'Not analysed yet' } as const;

function estimateOf(economics: DealEconomics | null): DealEstimate {
  if (!economics) return { resale: NOT_ANALYSED, upside: NOT_ANALYSED };
  const { resale, estimatedUpside: up } = economics;
  return {
    resale:
      resale.status === 'estimated'
        ? { status: 'estimated', basis: 'comparable_sales', low: resale.low, typical: resale.typical, high: resale.high, sampleSize: resale.sampleSize }
        : { status: 'unavailable', reason: resale.reason, detail: resale.detail },
    upside:
      up.status === 'estimated'
        ? { status: 'estimated', basis: 'estimate', low: up.low, typical: up.typical, high: up.high, typicalMarginPercent: up.typicalMarginPercent, excludes: up.excludes }
        : { status: 'unavailable', reason: up.reason, detail: up.detail },
  };
}

function assessmentOf(analysis: DealAnalysis | null): DealAssessment {
  if (!analysis) return { status: 'pending', strength: null, confidence: null, score: null, alertEligible: false, analyzedAt: null };
  return {
    status: analysis.status === 'COMPLETED' ? 'completed' : analysis.status === 'FAILED' ? 'failed' : 'pending',
    strength: (analysis.strength as DealAssessment['strength']) ?? null,
    confidence: (analysis.confidence as DealAssessment['confidence']) ?? null,
    score: analysis.score,
    alertEligible: analysis.alertEligible,
    analyzedAt: analysis.completedAt?.toISOString() ?? null,
  };
}
