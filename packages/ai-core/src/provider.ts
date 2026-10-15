import type {
  AIResultMeta,
  ConditionRiskAssessment,
  DealExplanation,
  ListingDraftSuggestion,
  ProductExtraction,
} from './schemas.js';

/** `mock` = local deterministic provider (default). `foundry` = Microsoft Foundry (Azure OpenAI v1 API), configured by environment. */
export const AI_PROVIDER_IDS = ['mock', 'foundry'] as const;
export type AIProviderId = (typeof AI_PROVIDER_IDS)[number];
export const DEFAULT_AI_PROVIDER: AIProviderId = 'mock';

export interface Money {
  amountMinor: number;
  currency: string;
}

/**
 * Everything a provider may know about a listing - only what the source actually returned.
 * Photos are passed as a count: no provider looks at images yet.
 */
export interface ListingFacts {
  marketplace: string;
  title: string;
  description: string | null;
  price: Money | null;
  conditionText: string | null;
  locationText: string | null;
  photoCount: number;
  /** ISO timestamp, or null when the source doesn't say. */
  listedAt: string | null;
  status: string;
}

export type HuntTarget = { kind: 'profit'; amount: Money } | { kind: 'margin'; percent: number };

export interface HuntContext {
  query: string;
  conditions: string[];
  maxPrice: Money | null;
  target: HuntTarget | null;
  exclusions: string[];
}

/**
 * Evidence that does NOT exist yet. Passing it explicitly makes the contract visible: outputs may
 * only describe seller or market facts that were given as input, and today none are.
 * TODO(ai): add seller facts / comparable sales here when sources exist (and widen the schemas).
 */
export interface EvidenceAvailability {
  seller: 'not_available';
  comparables: 'not_available';
}

export const NO_EXTERNAL_EVIDENCE: EvidenceAvailability = { seller: 'not_available', comparables: 'not_available' };

export interface ProductExtractionInput {
  listing: ListingFacts;
  hunt: Pick<HuntContext, 'query'>;
}

export interface ConditionRiskInput {
  listing: ListingFacts;
  /** "Now" for staleness, so results are reproducible. ISO timestamp. */
  asOf: string;
  evidence: EvidenceAvailability;
}

/** A deterministic matcher check, as stored on the HuntMatch. */
export interface MatchCheckFact {
  check: string;
  outcome: 'pass' | 'fail' | 'unverified' | 'not_applicable';
  detail: string;
}

export interface DealExplanationInput {
  listing: ListingFacts;
  hunt: HuntContext;
  matchChecks: MatchCheckFact[];
  product: ProductExtraction;
  risk: ConditionRiskAssessment;
  economics: { acquisition: Money | null; target: HuntTarget | null };
  evidence: EvidenceAvailability;
}

/** Resale estimate from comparable sales, frozen on the inventory item when it was bought. */
export interface ResaleEstimate {
  low: Money;
  typical: Money;
  high: Money;
  sampleSize: number;
}

/**
 * Everything known about an item a reseller bought and now wants to list. The purchase price and
 * the source marketplace are private to the seller: they are passed so the validator can make sure
 * they never leak into the listing, never so they can be shown to buyers.
 */
export interface ListingDraftFacts {
  /** The inventory item's title (user-editable). */
  itemTitle: string;
  /** Title of the listing it was bought from. */
  sourceTitle: string | null;
  sourceDescription: string | null;
  sourceConditionText: string | null;
  sourceMarketplace: 'ebay' | 'facebook' | null;
  purchasePrice: Money;
  /** Resale ESTIMATE frozen when the item was bought (comparable sales) - the only allowed basis for a price. */
  resaleEstimate: ResaleEstimate | null;
  /** Free text the seller typed (e.g. "battery 89%, small scratch on back"). */
  sellerNotes: string | null;
  photoCount: number;
  /** BCP-47, e.g. "en-ZA" - wording/spelling only. */
  localeTag: string;
}

export interface AIResult<T> {
  output: T;
  meta: AIResultMeta;
}

/**
 * The AI boundary. Domain code calls these structured tasks and never sees prompts, models or
 * vendor SDKs. Implementations: MockAIProvider (local), FoundryAIProvider. Always use a provider
 * wrapped by `withValidation`, so every output is schema-checked and grounded in the input.
 */
export interface AIProvider {
  readonly id: AIProviderId;
  extractProduct(input: ProductExtractionInput): Promise<AIResult<ProductExtraction>>;
  assessConditionRisk(input: ConditionRiskInput): Promise<AIResult<ConditionRiskAssessment>>;
  explainDeal(input: DealExplanationInput): Promise<AIResult<DealExplanation>>;
  /** Drafts a marketplace listing for an item the reseller owns (a suggestion the seller edits). */
  draftListing(facts: ListingDraftFacts): Promise<AIResult<ListingDraftSuggestion>>;
}

export const AI_ERROR_CODES = [
  /** Output doesn't match the task schema. */
  'INVALID_OUTPUT',
  /** Output claims something the input doesn't support. */
  'UNGROUNDED_OUTPUT',
  'NOT_CONFIGURED',
  'RATE_LIMITED',
  'UNAVAILABLE',
  /** The provider's content safety filter blocked the prompt or the answer. */
  'CONTENT_FILTERED',
  /** The provider rejected the request itself (e.g. the deployment doesn't support structured outputs). */
  'REQUEST_REJECTED',
] as const;
export type AIErrorCode = (typeof AI_ERROR_CODES)[number];

export class AIProviderError extends Error {
  readonly retryable: boolean;
  /** When the provider asked us to retry (rate limits); null = no preference. */
  readonly retryAfter: Date | null;

  constructor(
    readonly code: AIErrorCode,
    message: string,
    readonly details: string[] = [],
    options?: { cause?: unknown; retryAfter?: Date | null },
  ) {
    super(message, options);
    this.name = 'AIProviderError';
    this.retryable = code === 'RATE_LIMITED' || code === 'UNAVAILABLE';
    this.retryAfter = options?.retryAfter ?? null;
  }
}
