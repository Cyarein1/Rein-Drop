import { ingestionDiagnosticsQuerySchema } from '@rein-drop/contracts';
import { loadApiConfig } from '../../config/api-config.js';
import { DevDiagnosticsController } from './diagnostics.controller.js';
import { costPer, toIngestionDiagnostics, type DiagnosticsRows } from './diagnostics.mapper.js';
import { diagnosticsWindow, type DiagnosticsService } from './diagnostics.service.js';
import type { RunRow } from './diagnostics.sql.js';

const since = new Date('2026-10-01T00:00:00Z');
const until = new Date('2026-10-03T00:00:00Z'); // 2 days
const NOW = new Date('2026-10-03T00:00:01Z');

const run = (o: Partial<RunRow> & Pick<RunRow, 'total' | 'marketplace' | 'provider'>): RunRow => ({
  runs: 0,
  succeeded: 0,
  failed: 0,
  running: 0,
  requests: 0n,
  returned: 0n,
  new: 0n,
  updated: 0n,
  duplicates: 0n,
  unreadable: 0n,
  matched: 0n,
  newMatches: 0n,
  rejected: 0n,
  costUsd: null,
  costKnownRuns: 0,
  costIsEstimate: null,
  reqSamples: 0,
  reqP50: null,
  reqP95: null,
  reqMax: null,
  runSamples: 0,
  runP50: null,
  runP95: null,
  runMax: null,
  ...o,
});

const empty: DiagnosticsRows = { runs: [], rejections: [], analyses: [], alerts: [], ages: [], hunts: [] };

describe('ingestion diagnostics mapper', () => {
  it('builds per-source rows, a totals row, cost ratios and per-Hunt cost per day', () => {
    const rows: DiagnosticsRows = {
      runs: [
        run({ total: 0, marketplace: 'facebook', provider: 'apify-marketplace', runs: 4, succeeded: 3, failed: 1, requests: 4n, returned: 80n, new: 30n, duplicates: 2n, matched: 12n, newMatches: 6n, rejected: 18n, costUsd: 0.208, costKnownRuns: 4, costIsEstimate: true, reqSamples: 4, reqP50: 61_234.4, reqP95: 90_000, reqMax: 95_000.7 }),
        run({ total: 0, marketplace: 'ebay', provider: 'ebay-browse', runs: 2, succeeded: 2, requests: 3n, returned: 50n, new: 10n, matched: 4n, newMatches: 4n }),
        run({ total: 1, marketplace: null, provider: null, runs: 6, succeeded: 5, failed: 1, requests: 7n, returned: 130n, new: 40n, duplicates: 2n, matched: 16n, newMatches: 10n, rejected: 18n, costUsd: 0.208, costKnownRuns: 4, costIsEstimate: true }),
      ],
      rejections: [
        { total: 0, marketplace: 'facebook', provider: 'apify-marketplace', reason: 'relevance', count: 5n },
        { total: 0, marketplace: 'facebook', provider: 'apify-marketplace', reason: 'price', count: 13n },
        { total: 1, marketplace: null, provider: null, reason: 'price', count: 13n },
      ],
      analyses: [
        { total: 0, marketplace: 'facebook', provider: 'apify-marketplace', analyzed: 6, completed: 5, failed: 1, alertEligible: 2, aiProviders: ['foundry'], inputTokens: 6000n, outputTokens: 1200n, aiCostUsd: 0.00432, aiSamples: 6, aiP50: 3, aiP95: 9, aiMax: 10 },
      ],
      alerts: [
        { total: 0, marketplace: 'facebook', provider: 'apify-marketplace', alerts: 2 },
        { total: 1, marketplace: null, provider: null, alerts: 2 },
      ],
      ages: [{ total: 0, marketplace: 'ebay', provider: 'ebay-browse', discovered: 10, ageSamples: 8, ageP50: 600_000, ageP95: 3_600_000, ageMax: 7_200_000 }],
      hunts: [
        { huntId: 'h1', name: 'Switch', status: 'LIVE', marketplace: 'facebook', provider: 'apify-marketplace', runs: 4, costUsd: 0.104 },
        { huntId: 'h2', name: 'Lens', status: 'LIVE', marketplace: 'facebook', provider: 'apify-marketplace', runs: 4, costUsd: 0.104 },
        { huntId: 'h1', name: 'Switch', status: 'LIVE', marketplace: 'ebay', provider: 'ebay-browse', runs: 2, costUsd: null },
        { huntId: 'gone', name: null, status: null, marketplace: 'ebay', provider: 'ebay-browse', runs: 1, costUsd: null },
      ],
    };
    const d = toIngestionDiagnostics(rows, { since, until }, NOW);

    expect(d.window).toEqual({ since: since.toISOString(), until: until.toISOString(), hours: 48 });
    expect(d.sources.map((s) => `${s.marketplace}/${s.provider}`)).toEqual(['ebay/ebay-browse', 'facebook/apify-marketplace']);

    const fb = d.sources[1]!;
    expect(fb).toMatchObject({
      runs: { total: 4, succeeded: 3, failed: 1, running: 0 },
      requests: 4,
      huntsServed: 2,
      listings: { returned: 80, new: 30, duplicates: 2 },
      candidates: { evaluated: 30, matched: 12, newMatches: 6, rejected: 18, rejectionReasons: [{ reason: 'price', count: 13 }, { reason: 'relevance', count: 5 }] },
      analysis: { analyzed: 6, completed: 5, failed: 1, alertEligible: 2, aiProviders: ['foundry'], inputTokens: 6000, outputTokens: 1200, duration: { samples: 6, p50Ms: 3, p95Ms: 9, maxMs: 10 } },
      alerts: 2,
      latency: { request: { samples: 4, p50Ms: 61_234, p95Ms: 90_000, maxMs: 95_001 } },
    });
    // 0.208 USD over 4 runs, 6 new matches, 2 alerts; 2 Hunts over 2 days.
    expect(fb.cost).toEqual({
      providerUsd: 0.208,
      providerIsEstimate: true,
      runsWithKnownCost: 4,
      runsWithUnknownCost: 0,
      aiUsd: 0.00432, // as reported by the AI provider
      perRunUsd: 0.052,
      perNewMatchUsd: 0.034667,
      perAlertUsd: 0.104,
      perHuntDayUsd: 0.052,
    });

    // eBay is quota-based: cost unknown, so no ratios. Listing age is measured.
    const ebay = d.sources[0]!;
    expect(ebay.cost).toMatchObject({ providerUsd: null, providerIsEstimate: false, runsWithUnknownCost: 2, perRunUsd: null, perHuntDayUsd: null });
    expect(ebay.huntsServed).toBe(2);
    expect(ebay.listingAge).toEqual({ discovered: 10, withPostedTime: 8, age: { samples: 8, p50Ms: 600_000, p95Ms: 3_600_000, maxMs: 7_200_000 } });
    expect(ebay.analysis).toMatchObject({ analyzed: 0, aiProviders: [], duration: { samples: 0, p50Ms: null } });

    // Totals: distinct Hunts across sources (h1, h2, gone).
    expect(d.total).toMatchObject({ marketplace: 'all', provider: 'all', runs: { total: 6 }, huntsServed: 3, alerts: 2 });
    expect(d.total.cost.perHuntDayUsd).toBe(costPer(0.208, 3 * 2));
    expect(d.total.candidates.rejectionReasons).toEqual([{ reason: 'price', count: 13 }]);

    // Most expensive first; unknown cost last; deleted Hunts labelled.
    expect(d.hunts.map((h) => [h.huntId, h.marketplace, h.costUsd, h.perDayUsd])).toEqual([
      ['h1', 'facebook', 0.104, 0.052],
      ['h2', 'facebook', 0.104, 0.052],
      ['h1', 'ebay', null, null],
      ['gone', 'ebay', null, null],
    ]);
    expect(d.hunts[3]).toMatchObject({ name: '(deleted Hunt)', status: 'DELETED' });
  });

  it('is all zeros / nulls when nothing ran', () => {
    const d = toIngestionDiagnostics(empty, { since, until }, NOW);
    expect(d.sources).toEqual([]);
    expect(d.hunts).toEqual([]);
    expect(d.total).toMatchObject({ runs: { total: 0 }, requests: 0, huntsServed: 0, cost: { providerUsd: null, perHuntDayUsd: null }, latency: { request: { samples: 0, p50Ms: null } } });
  });

  it('never divides unknown cost or by zero', () => {
    expect(costPer(null, 3)).toBeNull();
    expect(costPer(1, 0)).toBeNull();
    expect(costPer(1, 3)).toBe(0.333333);
  });
});

describe('ingestion diagnostics window', () => {
  it('is the last `hours` ending now, or an explicit since/until', () => {
    expect(diagnosticsWindow(ingestionDiagnosticsQuerySchema.parse({}), NOW)).toEqual({ since: new Date(NOW.getTime() - 24 * 3_600_000), until: NOW });
    expect(diagnosticsWindow(ingestionDiagnosticsQuerySchema.parse({ hours: '2' }), NOW).since).toEqual(new Date(NOW.getTime() - 2 * 3_600_000));
    const explicit = ingestionDiagnosticsQuerySchema.parse({ since: since.toISOString(), until: until.toISOString(), hours: '5' });
    expect(diagnosticsWindow(explicit, NOW)).toEqual({ since, until });
  });

  it('rejects bad windows', () => {
    expect(ingestionDiagnosticsQuerySchema.safeParse({ hours: '0' }).success).toBe(false);
    expect(ingestionDiagnosticsQuerySchema.safeParse({ hours: String(24 * 91) }).success).toBe(false);
    expect(ingestionDiagnosticsQuerySchema.safeParse({ until: until.toISOString() }).success).toBe(false);
    expect(ingestionDiagnosticsQuerySchema.safeParse({ since: until.toISOString(), until: since.toISOString() }).success).toBe(false);
    expect(ingestionDiagnosticsQuerySchema.safeParse({ since: '2026-01-01T00:00:00Z', until: '2026-06-01T00:00:00Z' }).success).toBe(false);
  });
});

describe('DevDiagnosticsController', () => {
  it('is 404 in production, without touching the database', async () => {
    const service = { ingestion: vi.fn() } as unknown as DiagnosticsService;
    const prod = { ...loadApiConfig({ NODE_ENV: 'test' }), nodeEnv: 'production' } as ReturnType<typeof loadApiConfig>;
    await expect(new DevDiagnosticsController(service, prod).ingestion(ingestionDiagnosticsQuerySchema.parse({}))).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(service.ingestion).not.toHaveBeenCalled();
  });
});
