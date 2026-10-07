/**
 * Deal feed ordering: opportunity strength first, freshness second - never raw chronology.
 *
 * rank = score + FRESHNESS_BONUS_MAX x max(0, 1 - ageHours / FRESHNESS_WINDOW_HOURS)
 *
 * `score` is the stored DealAnalysis score, whose strength bands are 15 points apart (weak 5-20,
 * moderate 35-50, strong 65-80, exceptional 85-100). The freshness bonus is at most 14, so a
 * fresher deal moves up within its band and can never overtake a stronger band.
 * Age is measured from when the seller posted it, else from when Rein Drop first saw it.
 *
 * The API computes the same formula in SQL (apps/api deals feed query); keep them in step.
 * TODO(product): window / bonus are proposed defaults, like the scoring policy (decision 0005).
 */
export const FEED_RANKING = Object.freeze({
  /** Rank score for a deal with no completed analysis yet (or a failed one): bottom of "moderate". */
  unscoredScore: 35,
  freshnessBonusMax: 14,
  freshnessWindowHours: 72,
});

/** Rounded to 4 decimals (as the SQL does), so cursors compare exactly. */
export function feedRank(score: number | null, ageHours: number, ranking = FEED_RANKING): number {
  const freshness = Math.min(1, Math.max(0, 1 - ageHours / ranking.freshnessWindowHours));
  return Math.round(((score ?? ranking.unscoredScore) + ranking.freshnessBonusMax * freshness) * 10_000) / 10_000;
}
