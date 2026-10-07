# 0005 - Deal scoring: deterministic economics + AI judgement, evidence-gated tiers

_Status: accepted for the implementation (2026-10-07). The threshold VALUES are proposed defaults
pending the product decision in App Flow Blueprint section 22 ("What qualifies as Strong vs
Exceptional", "What minimum resale-price data is trustworthy enough")._

## Context

Build Prompt 21: score candidates, keep hard economics deterministic, combine them with the
AIProvider's qualitative analysis into a DealAnalysis with a confidence / strength classification,
keep estimated upside apart from realized profit, and decide alert eligibility so that not every
match alerts. The Blueprint says alerts are earned ("only when a candidate clears user + Rein Drop
thresholds"; notification precision is a product metric). The Tech Architecture says deterministic
economics remain authoritative and resale estimates depend on comparable data.

Today there is **no comparable-sales source**, so no resale value or profit can be estimated.

## Decision

All rules live in `@rein-drop/scoring` (pure functions, versioned by `SCORING_VERSION`; every
threshold in `DEFAULT_SCORING_POLICY`).

**Economics (deterministic, `computeEconomics`)**: asking price + costs the listing states (eBay
shipping, read through the adapter's `buyerCosts()`); max-price check on the asking price (the
matcher's rule) and again including known costs; resale estimate and **estimated upside** only from
real comparable sales (at least `minComparableSales`), as a low / typical / high range marked
`basis: 'estimate'`, listing the costs it does not include (selling and payment fees, shipping to
your buyer, repairs). Margin = upside / resale price (TODO: confirm). Nothing is ever called
profit: realized profit / loss comes only from recorded purchases and sales.

**Confidence** (how sure Rein Drop is): `low` when the product isn't identified, the fit is unclear,
the condition is unknown or there is no price; `high` only with a clearly identified matching
product AND a comparables-based estimate; otherwise `medium`. So today it is at most `medium`.

**Strength**:

| Tier | Rule |
|---|---|
| weak | Any blocker: AI reads it as a different product, high risk (faulty, locked), asking above your max, estimated upside below your target or not positive. |
| moderate | No blocker, but something keeps it below strong: medium / unknown risk, low confidence, over your max once shipping is added, or **none of your own price criteria could be verified**. |
| strong | No blocker or cap, and at least one of your criteria verified (within max price incl. known costs, or target met by an estimate). An unverified target does not cap (`allowStrongWithUnverifiedTarget`), but is recorded as "upside not estimated yet". |
| exceptional | Strong + high confidence + low risk + target met even at the low end of the estimate + typical upside >= `exceptionalTargetMultiple` (2x) the target. Impossible without comparables, which keeps it rare and evidence-based. |

A 0-100 ranking `score` orders deals inside non-overlapping bands per tier (weak 5-20, moderate
35-50, strong 65-80, exceptional 85-100) using confidence, relevance and headroom / margin.
Freshness is not stored in it; the feed applies it at read time (Build Prompt 22).

**Alert eligibility** (every rule recorded): completed analysis, hunt LIVE, match still NEW, listing
ACTIVE, not a duplicate, strength >= `strong`, confidence >= `medium`, posted within
`maxAlertListingAgeHours` (48h; unknown posting date doesn't block) so a new hunt's backlog doesn't
alert. Kind `exceptional` for exceptional deals, else `deal`. Creating alerts (once per match,
channels, preferences, per-hunt caps) is Build Prompt 24.

**Pipeline**: each search enqueues a `deal.analyze` job (queue `deal-analysis`) per open match it
confirmed. The handler re-checks the match (never analyses dismissed / expired / duplicate / paused),
runs the AIProvider, scores, and upserts one DealAnalysis per (match, input hash). The hash covers
the AI input (with "now" at day granularity), costs, comparables, scoring version and policy, so an
unchanged listing costs no AI call. Retryable AI failures retry the job; the last attempt is stored
as FAILED (economics kept, no strength, never eligible).

**Feed ranking** (added in step 25, `FEED_RANKING` / `feedRank`, mirrored by the Deals API SQL):
rank = score + up to 14 freshness points fading linearly over 72h (age from the posting time, else
from discovery). The bonus is smaller than the 15-point gap between strength bands, so freshness
reorders deals within a band and never lifts one above a stronger band. Unanalysed deals rank as
score 35 (bottom of moderate).

## Consequences

- With today's data, a hunt alerts only when it has a max price: "strong" means within your max,
  clean, clearly the right product - and the alert must say the upside is not estimated.
- A hunt with no max price and no target can't produce alerts (only feed entries) until resale data
  exists. Product may prefer otherwise - change the policy, not the code.
- Changing any value in the policy: bump `SCORING_VERSION`; the new hash re-scores open matches.
- TODO(product): confirm the thresholds, the margin definition and the stale-listing window.
- TODO(data): a comparables source; auctions currently score on the current bid.
