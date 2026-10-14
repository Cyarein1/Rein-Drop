import { describe, expect, it } from 'vitest';
import { apiErrorBodySchema, evaluateActivation, type PlanEntitlements } from './index.js';

const FREE: PlanEntitlements = {
  activeHunts: { limit: 1 },
  savedHunts: { limit: 10 },
  marketplaces: ['ebay'],
  hotHunts: { available: false, limit: 0 },
  monitoringPriority: 'NORMAL',
  analyticsHistoryDays: 30,
  seats: 1,
};
const hunt = { marketplaces: ['ebay' as const], location: null, priority: 'NORMAL' as const };

describe('evaluateActivation', () => {
  it('allows activation within the plan', () => {
    expect(evaluateActivation(FREE, 0, hunt)).toEqual([]);
    expect(evaluateActivation({ ...FREE, activeHunts: { limit: null } }, 99, hunt)).toEqual([]);
  });

  it('blocks at the active-hunt limit with numbers and resolutions', () => {
    expect(evaluateActivation(FREE, 1, hunt)).toEqual([
      expect.objectContaining({
        code: 'ACTIVE_HUNT_LIMIT_REACHED',
        limit: 1,
        used: 1,
        resolutions: ['pause_another_hunt', 'upgrade_plan'],
      }),
    ]);
  });

  it('blocks marketplaces outside the plan and unready hunts, all at once', () => {
    const reasons = evaluateActivation(FREE, 1, { ...hunt, marketplaces: ['ebay', 'facebook'] });
    expect(reasons.map((r) => r.code)).toEqual(['NOT_READY', 'ACTIVE_HUNT_LIMIT_REACHED', 'MARKETPLACE_NOT_IN_PLAN']);
    expect(reasons.find((r) => r.code === 'MARKETPLACE_NOT_IN_PLAN')).toMatchObject({ marketplaces: ['facebook'] });
  });

  it('error bodies can carry the activation block', () => {
    const body = {
      statusCode: 409,
      code: 'ACTIVATION_BLOCKED',
      message: 'This hunt cannot go live yet',
      activationBlock: { planCode: 'free', reasons: evaluateActivation(FREE, 1, hunt) },
      path: '/hunts/x/activate',
      timestamp: '2026-10-07T00:00:00.000Z',
    };
    expect(apiErrorBodySchema.safeParse(body).success).toBe(true);
  });
});
