import { describe, expect, it } from 'vitest';
import type { ActivationBlockReason } from '@rein-drop/contracts';
import { accountSiteLine, companionAccessSummary, companionActions, companionReasonText, SELLING_WORDS } from './companion-access.js';
import { planLimitState, reducedMonitoringState } from './product-states.js';

const ent = (limit: number | null, used: number) =>
  ({ entitlements: { activeHunts: { limit } }, usage: { activeHunts: used }, remaining: { activeHunts: limit === null ? null : Math.max(limit - used, 0) } }) as never;

const REASONS: ActivationBlockReason[] = [
  { code: 'ACTIVE_HUNT_LIMIT_REACHED', message: 'Your plan allows 1 live hunt ... or upgrade', limit: 1, used: 1, resolutions: ['pause_another_hunt', 'upgrade_plan'] },
  { code: 'MARKETPLACE_NOT_IN_PLAN', message: '... or upgrade.', marketplaces: ['facebook'], resolutions: ['edit_hunt', 'upgrade_plan'] },
  { code: 'PRIORITY_NOT_IN_PLAN', message: '...', priority: 'HIGH' as never, resolutions: ['edit_hunt', 'upgrade_plan'] },
  { code: 'NOT_READY', message: '...', problems: ['Add a location for Facebook Marketplace.'], resolutions: ['edit_hunt'] },
];

describe('companion access wording (decision 0018)', () => {
  it('summarises current access neutrally', () => {
    expect(companionAccessSummary(ent(1, 1))).toBe('Your current access includes 1 live Hunt (1 in use).');
    expect(companionAccessSummary(ent(null, 4))).toBe('Your current access includes unlimited live Hunts (4 in use).');
  });

  it('explains every block reason without selling, offering only actions inside current access', () => {
    const texts = REASONS.map(companionReasonText);
    expect(texts[0]).toBe('Your current access includes 1 live Hunt, and 1 is live. Pause another Hunt to watch this one - it stays saved as a draft.');
    expect(texts[1]).toBe("Your current access doesn't include Facebook Marketplace. Remove it from this Hunt to start watching.");
    expect(texts[3]).toBe('Add a location for Facebook Marketplace.');
    for (const t of texts) expect(t).not.toMatch(SELLING_WORDS);
    expect(companionActions(REASONS)).toEqual({ pauseAnother: true, editHunt: true });
    expect(companionActions([REASONS[0]!])).toEqual({ pauseAnother: true, editHunt: false });
  });

  it('the account line is off unless a site is configured, and never mentions buying', () => {
    expect(accountSiteLine(undefined)).toBeNull();
    expect(accountSiteLine('  ')).toBeNull();
    expect(accountSiteLine('https://reindrop.com/')).toBe('You can manage your account at reindrop.com.');
    expect(accountSiteLine('reindrop.com')).not.toMatch(SELLING_WORDS);
  });

  it('shared product states: the companion variant drops plans and upgrade; the web keeps its wording', () => {
    const hunts = [
      { id: 'h1', name: 'PS5', status: 'LIVE' as const },
      { id: 'h2', name: 'Switch', status: 'DRAFT' as const },
    ];
    const companion = planLimitState(ent(1, 1), hunts, 'companion')!;
    expect(companion.title).toBe('Your current access watches 1 Hunt at a time');
    expect(`${companion.title} ${companion.body} ${companion.actions.map((a) => a.label).join(' ')}`).not.toMatch(SELLING_WORDS);
    expect(companion.actions.map((a) => a.label)).toEqual(['Manage live Hunts']);
    expect(planLimitState(ent(1, 1), hunts)!.body).toMatch(/or upgrade to watch more/);

    const monitoring = { mode: 'reduced', reason: 'plan_cadence', checksEveryMinutes: 60, resumesAt: null } as never;
    const reduced = reducedMonitoringState(monitoring, new Date(), { localeTag: 'en' }, 'companion')!;
    expect(reduced.actions).toEqual([]);
    expect(`${reduced.title} ${reduced.body}`).not.toMatch(/\bplan\b/i);
    expect(reducedMonitoringState(monitoring, new Date(), { localeTag: 'en' })!.actions.map((a) => a.label)).toEqual(['See plans']);
  });
});
