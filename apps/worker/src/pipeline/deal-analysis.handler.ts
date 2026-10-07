import { createHash } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { Prisma, type PrismaClient } from '@rein-drop/db';
import { analysisInputKey, analyzeCandidate, type AIProvider, type CandidateAnalysisInput, type MatchCheckFact } from '@rein-drop/ai-core';
import { isMarketplaceId, type MarketplaceRegistry, type Money, type NormalizedListing } from '@rein-drop/marketplace-core';
import {
  DEFAULT_SCORING_POLICY,
  SCORING_VERSION,
  computeEconomics,
  evaluateAlertEligibility,
  scoreCandidate,
  type ComparableSales,
  type KnownCost,
  type ScoringPolicy,
} from '@rein-drop/scoring';
import type { Clock, LeasedJob } from '../queue/job-queue.js';
import { RetryableJobError, type JobHandler } from '../queue/job-runner.js';
import { toMatchHunt } from './match-stage.js';

export const ANALYSIS_QUEUE = 'deal-analysis';
export const ANALYSIS_JOB_TYPE = 'deal.analyze';
/** DI token of the JobRunner for ANALYSIS_QUEUE (separate from searches: AI work never delays polling). */
export const ANALYSIS_RUNNER = Symbol('ANALYSIS_RUNNER');

export type AnalysisJobPayload = { huntMatchId: string };

/** Why a job ended without a new analysis (logged; also returned for tests). */
export type AnalysisOutcome = 'analyzed' | 'failed' | 'unchanged' | 'match_gone' | 'match_closed' | 'hunt_not_live' | 'duplicate_listing';

/**
 * Deal scoring for one open match: AIProvider qualitative analysis (product, condition / risk,
 * explanation) + deterministic economics + strength / confidence classification + alert
 * eligibility, stored as one DealAnalysis.
 *
 * Only matches that passed every cheap deterministic check get here (the Tech Architecture rule:
 * never send a listing that fails hard filters to an LLM). Idempotent: one DealAnalysis per
 * (match, input hash); an unchanged input is never analysed twice. A retryable AI failure retries
 * the job; the last attempt (or a permanent failure) is stored as FAILED, which never alerts.
 */
export class DealAnalysisHandler implements JobHandler<AnalysisJobPayload> {
  readonly type = ANALYSIS_JOB_TYPE;
  private readonly logger = new Logger(DealAnalysisHandler.name);

  constructor(
    private readonly prisma: PrismaClient,
    private readonly ai: AIProvider,
    private readonly registry: MarketplaceRegistry,
    private readonly policy: ScoringPolicy = DEFAULT_SCORING_POLICY,
    private readonly clock: Clock = () => new Date(),
  ) {}

  async handle(job: LeasedJob<AnalysisJobPayload>): Promise<void> {
    const outcome = await this.analyze(job);
    // "unchanged" is the normal case on every polling window - not worth a log line.
    if (outcome === 'failed') this.logger.warn(`Analysis of match ${job.payload.huntMatchId} failed (stored as FAILED; never alerts)`);
    else if (outcome !== 'analyzed' && outcome !== 'unchanged') this.logger.debug(`Analysis of match ${job.payload.huntMatchId} skipped: ${outcome}`);
  }

  async analyze(job: LeasedJob<AnalysisJobPayload>): Promise<AnalysisOutcome> {
    const match = await this.prisma.huntMatch.findUnique({
      where: { id: job.payload.huntMatchId },
      include: {
        listing: { include: { marketplace: { select: { key: true } } } },
        hunt: { include: { marketplaces: { where: { isEnabled: true }, select: { marketplace: { select: { key: true } } } } } },
      },
    });
    // Cheap re-checks first: no AI spend on anything that can't become a deal any more.
    if (!match) return 'match_gone';
    if (match.status !== 'NEW' && match.status !== 'SEEN') return 'match_closed';
    if (match.hunt.status !== 'LIVE') return 'hunt_not_live';
    if (match.listing.duplicateOfId) return 'duplicate_listing';

    const { listing, hunt } = match;
    const now = this.clock();
    const criteria = toMatchHunt(hunt);
    const price: Money | null = listing.priceMinor !== null && listing.currency ? { amountMinor: listing.priceMinor, currency: listing.currency } : null;
    const input: CandidateAnalysisInput = {
      listing: {
        marketplace: listing.marketplace.key,
        title: listing.title,
        description: listing.description,
        price,
        conditionText: listing.conditionText,
        locationText: listing.locationText,
        photoCount: listing.imageUrls.length,
        listedAt: listing.listedAt?.toISOString() ?? null,
        status: listing.status,
      },
      hunt: {
        query: criteria.query,
        conditions: [...criteria.conditions],
        maxPrice: criteria.maxPrice,
        target: criteria.target,
        exclusions: [...criteria.exclusions],
      },
      matchChecks: (match.reasons as unknown as MatchCheckFact[]).map(({ check, outcome, detail }) => ({ check, outcome, detail })),
      economics: { acquisition: price, target: criteria.target },
      // Day granularity: staleness is judged in days, and an unchanged listing is re-analysed at
      // most once a day instead of on every search.
      asOf: startOfUtcDay(now).toISOString(),
    };
    const knownCosts = this.buyerCosts(listing.marketplace.key, price, listing.sourceMetadata);
    // TODO(data): pass comparable sales once a resale price source exists (Blueprint section 22).
    const comparables: ComparableSales | null = null;

    const inputHash = createHash('sha256')
      .update(analysisInputKey(input, { provider: this.ai.id, promptVersion: null }))
      .update(JSON.stringify({ scoringVersion: SCORING_VERSION, policy: this.policy, knownCosts, comparables, relevance: match.relevanceScore }))
      .digest('hex');
    const key = { huntMatchId_inputHash: { huntMatchId: match.id, inputHash } };
    const existing = await this.prisma.dealAnalysis.findUnique({ where: key, select: { status: true } });
    if (existing?.status === 'COMPLETED') return 'unchanged';

    const record = await analyzeCandidate(this.ai, input, () => this.clock().getTime());
    if (record.status === 'FAILED' && record.retryable && job.attempt < job.maxAttempts) {
      throw new RetryableJobError(`AI ${record.errorCode}: ${record.errorMessage}`);
    }

    const economics = computeEconomics({ asking: price, knownCosts, maxPrice: criteria.maxPrice, target: criteria.target, comparables }, this.policy);
    const assessment =
      record.status === 'COMPLETED' ? scoreCandidate({ economics, analysis: record.result, relevanceScore: match.relevanceScore }, this.policy) : null;
    const eligibility = evaluateAlertEligibility(
      {
        assessment,
        huntStatus: hunt.status,
        matchStatus: match.status,
        listingStatus: listing.status,
        isDuplicate: listing.duplicateOfId !== null,
        listedAt: listing.listedAt?.toISOString() ?? null,
        asOf: now.toISOString(),
      },
      this.policy,
    );

    const data = {
      status: record.status,
      provider: record.provider,
      model: record.model,
      modelVersion: record.modelVersion,
      promptVersion: record.promptVersion,
      schemaVersion: record.schemaVersion,
      providerMetadata: record.providerMetadata as unknown as Prisma.InputJsonValue,
      durationMs: record.durationMs,
      result: record.status === 'COMPLETED' ? (record.result as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
      errorMessage: record.errorMessage,
      scoringVersion: SCORING_VERSION,
      economics: economics as unknown as Prisma.InputJsonValue,
      strength: assessment?.strength ?? null,
      confidence: assessment?.confidence ?? null,
      score: assessment?.score ?? null,
      scoring: {
        strengthReasons: assessment?.strengthReasons ?? [],
        confidenceReasons: assessment?.confidenceReasons ?? [],
        alert: eligibility,
      } as unknown as Prisma.InputJsonValue,
      alertEligible: eligibility.eligible,
      alertKind: eligibility.kind,
      completedAt: now,
    };
    await this.prisma.dealAnalysis.upsert({
      where: key,
      create: { listingId: listing.id, huntMatchId: match.id, inputHash, ...data },
      update: data,
    });
    return record.status === 'COMPLETED' ? 'analyzed' : 'failed';
  }

  /** Costs the listing states, read by its own adapter (domain code never reads sourceMetadata). */
  private buyerCosts(marketplace: string, price: Money | null, sourceMetadata: Prisma.JsonValue): KnownCost[] {
    if (!isMarketplaceId(marketplace) || !this.registry.has(marketplace)) return [];
    const adapter = this.registry.get(marketplace);
    const metadata = sourceMetadata && typeof sourceMetadata === 'object' && !Array.isArray(sourceMetadata) ? sourceMetadata : null;
    return adapter.buyerCosts?.({ price, sourceMetadata: metadata as NormalizedListing['sourceMetadata'] }) ?? [];
  }
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}
