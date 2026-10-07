import type { PrismaClient } from '@rein-drop/db';
import { loadApiConfig } from '../../config/api-config.js';
import { SubscriptionsService } from './subscriptions.service.js';

describe('SubscriptionsService.confirmDevelopmentPlan', () => {
  it('is refused in production before touching the database', async () => {
    const prisma = { $transaction: vi.fn() } as unknown as PrismaClient;
    const prodConfig = { ...loadApiConfig({}), nodeEnv: 'production' as const };
    const service = new SubscriptionsService(prisma, prodConfig);
    await expect(service.confirmDevelopmentPlan('user-1', 'pro')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
